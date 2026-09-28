import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { AutocompleteService } from "../../search/autocomplete";
import { SearchEngineManager } from "../../search/manager";
import { SearchService } from "../../search/service";
import { type SearchModels, SearchTypes } from "../../search/types";
import { SettingsHandler } from "../../settings";
import { ConfigHandler } from "../../utils/config";
import { AppConstants } from "../../utils/constants";
import { AuthHandler } from "../utils/authHandler";
import { RateLimiter } from "../utils/rateLimiter";
import { RequestInfo } from "../utils/requestInfo";

/**
 * SearXNG compatible API (`/api/searxng/search?q=…&format=json`), so tools built for SearXNG —
 * Open WebUI, Perplexica, LibreChat, SearXNG clients, other metasearchers — can use X-Ray.
 *
 * This is a compatibility-proxy surface (see docs/04 › Compatibility-proxy backend): responses
 * are SearXNG-native, not the `{ success, code, message, data }` envelope, and requests are
 * validated by hand. Authentication uses X-Ray API keys, passed as `Authorization: Bearer …`,
 * `X-API-Key: …`, or — for clients that can only configure a URL — `?api_key=…`.
 */
export const searxngRouter = new Hono<{ Variables: { userID: number | null } }>();

const KEY_QUERY_PARAMS = ["api_key", "apikey", "key", "token"];

function error(c: Context, status: 400 | 401 | 404 | 429, message: string) {
	return c.json({ error: message }, status);
}

/** Read request params from the query string and (for POST) a form or JSON body. */
async function params(c: Context): Promise<Record<string, string>> {
	const values: Record<string, string> = { ...c.req.query() };
	if (c.req.method === "POST") {
		const type = c.req.header("content-type") ?? "";
		try {
			if (type.includes("application/json")) {
				for (const [key, value] of Object.entries((await c.req.json()) as Record<string, unknown>)) {
					if (value !== null && value !== undefined) values[key] = String(value);
				}
			} else {
				const form = await c.req.parseBody();
				for (const [key, value] of Object.entries(form))
					if (typeof value === "string") values[key] = value;
			}
		} catch {
			// Ignore malformed bodies — missing params are reported below.
		}
	}
	return values;
}

const searxngAuth = createMiddleware<{ Variables: { userID: number | null } }>(async (c, next) => {
	const settings = await SettingsHandler.getInstance();
	if (!settings.searxng_api_enabled)
		return error(c, 404, "The SearXNG API is disabled on this instance");

	const bearer = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	const key =
		bearer ??
		c.req.header("x-api-key") ??
		KEY_QUERY_PARAMS.map((name) => c.req.query(name)).find((v) => !!v);

	if (key) {
		const authContext = await AuthHandler.getAuthContext(key);
		if (!authContext || !(await AuthHandler.isValidAuthContext(authContext))) {
			return error(c, 401, "Invalid or expired API key");
		}
		c.set("userID", authContext.user_id);
		return next();
	}

	if (settings.searxng_api_require_key || settings.search_access !== "public") {
		return error(
			c,
			401,
			"An X-Ray API key is required (Authorization: Bearer <key>, X-API-Key or ?api_key=)",
		);
	}

	const limit = RateLimiter.hit(
		`searxng:${RequestInfo.clientIP(c) ?? "unknown"}`,
		settings.public_rate_limit_per_minute,
	);
	if (!limit.allowed) {
		c.header("Retry-After", String(limit.retryAfterSeconds));
		return error(c, 429, "Too many requests");
	}
	c.set("userID", null);
	return next();
});

searxngRouter.get("/healthz", (c) => c.text("OK"));

searxngRouter.use("/search", searxngAuth);
searxngRouter.use("/autocompleter", searxngAuth);
searxngRouter.use("/config", searxngAuth);

async function handleSearch(c: Context<{ Variables: { userID: number | null } }>) {
	const input = await params(c);
	const q = input.q?.trim();
	if (!q) return error(c, 400, "Missing query parameter `q`");
	if (q.length > 500) return error(c, 400, "Query too long");

	const format = (input.format ?? "json").toLowerCase();
	if (!["json", "csv", "rss"].includes(format))
		return error(c, 400, "Supported formats: json, csv, rss");

	const categories = (input.categories ?? input.category ?? "general")
		.split(",")
		.map((cat) => cat.trim().toLowerCase())
		.map((cat) => (cat === "image" ? "images" : cat === "video" ? "videos" : cat))
		.filter((cat): cat is SearchTypes.Category =>
			(SearchTypes.Categories as readonly string[]).includes(cat),
		);
	if (!categories.length) categories.push("general");

	const page = Math.min(Math.max(Number.parseInt(input.pageno ?? "1", 10) || 1, 1), 20);
	const language = input.language && input.language !== "auto" ? input.language : undefined;
	const safesearch = ["0", "1", "2"].includes(input.safesearch ?? "")
		? (Number(input.safesearch) as SearchTypes.SafeSearch)
		: undefined;
	const timeRange = (SearchTypes.TimeRanges as readonly string[]).includes(input.time_range ?? "")
		? (input.time_range as SearchTypes.TimeRange)
		: null;
	const engines = input.engines
		?.split(",")
		.map((e) => e.trim())
		.filter(Boolean);

	const userID = c.get("userID");
	const preferences = await SettingsHandler.getEffectivePreferences(userID);
	const responses = await Promise.all(
		categories.map((category) =>
			SearchService.search(
				{
					query: q,
					category,
					page,
					language:
						language && /^(all|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/.test(language) ? language : undefined,
					safesearch,
					timeRange,
					engines,
				},
				{
					userID,
					preferences,
					clientIP: RequestInfo.clientIP(c),
					userAgent: RequestInfo.userAgent(c),
					resolveBangs: false,
					imageProxy: false,
				},
			),
		),
	);

	const results = responses.flatMap((r) => r.results);
	const engineNames = new Map(
		(await SearchEngineManager.all()).map((e) => [e.config.slug, e.config.name]),
	);

	if (format === "csv")
		return c.body(toCSV(results), 200, { "Content-Type": "text/csv; charset=utf-8" });
	if (format === "rss") {
		return c.body(toRSS(q, results), 200, { "Content-Type": "application/rss+xml; charset=utf-8" });
	}

	const answers = responses.flatMap((r) => r.instant_answers);
	return c.json({
		query: q,
		number_of_results: responses.reduce((sum, r) => sum + r.number_of_results, 0),
		results: results.map((result) => toSearXNGResult(result)),
		answers: answers
			.filter((a) => a.placement === "top")
			.map((a) => ({ answer: a.text, url: a.source?.url ?? null, engine: a.provider })),
		corrections: [...new Set(responses.flatMap((r) => r.corrections))],
		infoboxes: answers
			.filter((a) => a.placement === "side")
			.map((a) => ({
				infobox: a.title,
				id: a.source?.url ?? a.title,
				content: a.text,
				img_src: typeof a.data.thumbnail === "string" ? a.data.thumbnail : null,
				urls: a.source?.url ? [{ title: a.source.name, url: a.source.url }] : [],
				attributes: [],
				engine: a.provider,
				engines: [a.provider],
			})),
		suggestions: [...new Set(responses.flatMap((r) => r.suggestions))],
		unresponsive_engines: responses
			.flatMap((r) => r.engines)
			.filter((e) => e.status !== "ok")
			.map((e) => [engineNames.get(e.slug) ?? e.slug, e.error ?? e.status]),
	});
}

searxngRouter.get("/search", handleSearch);
searxngRouter.post("/search", handleSearch);

searxngRouter.get("/autocompleter", async (c) => {
	const q = c.req.query("q") ?? "";
	const preferences = await SettingsHandler.getEffectivePreferences(c.get("userID"));
	const suggestions = await AutocompleteService.suggest(
		q,
		preferences.autocomplete,
		preferences.language,
	);
	return c.json([q, suggestions]);
});

searxngRouter.get("/config", async (c) => {
	const [settings, preferences, engines] = await Promise.all([
		SettingsHandler.getInstance(),
		SettingsHandler.getEffectivePreferences(c.get("userID")),
		SearchEngineManager.all(),
	]);
	return c.json({
		instance_name: settings.instance_name,
		version: AppConstants.APP_VERSION,
		brand: { GIT_URL: "https://git.leicraftmc.de/X-Ray-Search/X-Ray" },
		categories: [...SearchTypes.Categories],
		engines: engines.map((e) => ({
			name: e.config.slug,
			display_name: e.config.name,
			categories: [...e.config.categories],
			enabled: !preferences.disabled_engines.includes(e.config.slug),
			shortcut: e.config.slug,
			paging: true,
			time_range_support: true,
			safesearch: true,
			timeout: e.config.timeoutMs / 1000,
		})),
		autocomplete: preferences.autocomplete === "none" ? "" : preferences.autocomplete,
		safe_search: preferences.safesearch,
		default_locale: preferences.language,
		locales: {},
		plugins: [],
	});
});

function parsedURL(url: string) {
	try {
		const u = new URL(url);
		return [
			u.protocol.replace(/:$/, ""),
			u.host,
			u.pathname,
			"",
			u.search.replace(/^\?/, ""),
			u.hash.replace(/^#/, ""),
		];
	} catch {
		return ["", "", "", "", "", ""];
	}
}

function toSearXNGResult(result: SearchModels.Result) {
	const template = {
		web: "default.html",
		news: "default.html",
		image: "images.html",
		video: "videos.html",
	}[result.template];
	return {
		url: result.url,
		title: result.title,
		content: result.content,
		engine: result.engines[0] ?? "",
		engines: result.engines,
		positions: result.positions,
		score: result.score,
		category: result.category,
		template,
		parsed_url: parsedURL(result.url),
		publishedDate: result.published_at ? new Date(result.published_at).toISOString() : null,
		thumbnail: result.thumbnail ?? "",
		thumbnail_src: result.thumbnail ?? "",
		img_src: result.img_src ?? "",
		iframe_src: result.embed_url ?? "",
		length: result.duration ?? "",
		author: result.author ?? "",
		source: result.source ?? "",
	};
}

function toCSV(results: SearchModels.Result[]) {
	const csvCell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
	const rows = [["title", "url", "content", "host", "engine", "score", "type"].join(",")];
	for (const r of results) {
		let host = "";
		try {
			host = new URL(r.url).host;
		} catch {}
		rows.push(
			[r.title, r.url, r.content, host, r.engines.join(" "), r.score, "result"].map(csvCell).join(","),
		);
	}
	return `${rows.join("\r\n")}\r\n`;
}

function toRSS(query: string, results: SearchModels.Result[]) {
	const xml = (value: string) =>
		value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const items = results
		.map(
			(r) =>
				`<item><title>${xml(r.title)}</title><link>${xml(r.url)}</link><description>${xml(r.content)}</description>${r.published_at ? `<pubDate>${new Date(r.published_at).toUTCString()}</pubDate>` : ""}</item>`,
		)
		.join("");
	return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><title>${xml(`${AppConstants.APP_NAME} search: ${query}`)}</title><description>${xml(`Search results for "${query}"`)}</description><link>${xml(`${ConfigHandler.getConfig()?.APP_URL ?? ""}/search?q=${encodeURIComponent(query)}`)}</link><opensearch:totalResults>${results.length}</opensearch:totalResults><opensearch:itemsPerPage>${results.length}</opensearch:itemsPerPage>${items}</channel></rss>`;
}
