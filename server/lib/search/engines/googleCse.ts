import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const PUBLIC_CX = "partner-pub-8993703457585266:4862972284";

const Settings = z.object({
	cx: z
		.string()
		.trim()
		.regex(/^[\w.:-]+$/, "Use the search engine ID (`cx`) from programmablesearchengine.google.com")
		.default(PUBLIC_CX)
		.describe(
			"ID (`cx`) of the Google Programmable Search Engine to query. The default is a shared public engine, so results are whatever it is configured to return — create your own at programmablesearchengine.google.com, set it to search the entire web (and enable image search for the Images tab) and paste its ID here.",
		),
});

/**
 * Google results through the public Programmable Search Element endpoint (`cse.google.com`) —
 * no API key needed. Every request needs a `cse_token` that the element script `cse.js?cx=…`
 * embeds in its JSONP options; it is cached per `cx` for an hour and dropped when a search
 * returns an error. Both steps answer with JSONP.
 *
 * Google caps a Programmable Search at 100 results, so only 5 pages of 20 are available. The
 * category of the instance decides between web and image search (image search only works if
 * the `cx` has it enabled).
 */
export class GoogleCSEEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "google_cse",
		name: "Google (Programmable Search)",
		description: "Web and image results from Google via a Programmable Search Engine (no API key).",
		website: "https://programmablesearchengine.google.com",
		categories: ["general", "images"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 20,
	});

	private static readonly SCRIPT_URL = "https://cse.google.com/cse/cse.js";
	private static readonly ELEMENT_URL = "https://cse.google.com/cse/element/v1";
	private static readonly PAGE_SIZE = 20;
	private static readonly MAX_PAGE = 5;
	private static readonly TOKEN_TTL_MS = 60 * 60_000;
	private static readonly TOKEN_CACHE_MAX = 100;
	private static readonly tokens = new Map<string, GoogleCSEEngine.Token & { expires: number }>();

	private static readonly HEADERS = { Accept: "*/*", Referer: "https://cse.google.com/" };
	private static readonly COOKIES = { CONSENT: "YES+" };

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (query.page > GoogleCSEEngine.MAX_PAGE) return { results: [] };

		const hadToken = Boolean(GoogleCSEEngine.cachedToken(this.settings.cx));
		let data = await this.request(query, await this.token());

		// A cached token may have been revoked early — retry once with a fresh one.
		if (data.error && hadToken && data.error.code !== 429) {
			GoogleCSEEngine.tokens.delete(this.settings.cx);
			data = await this.request(query, await this.token());
		}
		if (data.error) {
			GoogleCSEEngine.tokens.delete(this.settings.cx);
			const message = `Google CSE: ${data.error.message ?? "unknown error"}`;
			throw new EngineError(data.error.code === 429 ? "blocked" : "http", message);
		}

		const correction = SearchUtils.cleanText(data.spelling?.correctedQuery);
		const total = Number(data.cursor?.estimatedResultCount);
		return {
			results: GoogleCSEEngine.parseResults(data, query.category === "images" ? "image" : "web"),
			corrections: correction && correction !== query.query ? [correction] : [],
			totalResults: Number.isFinite(total) && total > 0 ? total : undefined,
		};
	}

	private async request(
		query: SearchTypes.EngineQuery,
		token: GoogleCSEEngine.Token,
	): Promise<GoogleCSEEngine.Response> {
		const { language, region } = SearchUtils.parseLocale(query.language);
		const params = new URLSearchParams({
			rsz: "filtered_cse",
			num: String(GoogleCSEEngine.PAGE_SIZE),
			hl: language ?? "en",
			cselibv: token.libVersion,
			cx: this.settings.cx,
			q: query.query,
			safe: ["off", "medium", "high"][query.safesearch]!,
			cse_tok: token.token,
			callback: "_",
			rurl: "",
			searchtype: query.category === "images" ? "image" : "",
		});
		if (language) params.set("lr", `lang_${language}`);
		if (region) params.set("gl", region.toLowerCase());
		if (query.page > 1) params.set("start", String((query.page - 1) * GoogleCSEEngine.PAGE_SIZE));
		const sort = GoogleCSEEngine.dateRestrict(query.timeRange);
		if (sort) params.set("sort", sort);
		if (token.exp) params.set("exp", token.exp);

		const body = await this.http.text(`${GoogleCSEEngine.ELEMENT_URL}?${params}`, {
			language: query.language,
			headers: GoogleCSEEngine.HEADERS,
			cookies: GoogleCSEEngine.COOKIES,
		});
		const data = GoogleCSEEngine.parseJSONP(body);
		if (!data) throw new EngineError("parse", "Google CSE returned an unreadable response");
		return data;
	}

	private static cachedToken(cx: string): GoogleCSEEngine.Token | undefined {
		const cached = GoogleCSEEngine.tokens.get(cx);
		return cached && cached.expires > Date.now() ? cached : undefined;
	}

	/** The element token for the configured `cx` (cached for an hour). */
	private async token(): Promise<GoogleCSEEngine.Token> {
		const cx = this.settings.cx;
		const cached = GoogleCSEEngine.cachedToken(cx);
		if (cached) return cached;

		const script = await this.http.text(
			`${GoogleCSEEngine.SCRIPT_URL}?${new URLSearchParams({ cx })}`,
			{ headers: { Accept: "*/*" }, cookies: GoogleCSEEngine.COOKIES },
		);
		const token = GoogleCSEEngine.parseToken(script);
		if (!token) {
			if (/unusual traffic|captcha/i.test(script)) {
				throw new EngineError("blocked", "Google presented a captcha");
			}
			throw new EngineError("parse", `Google CSE did not return a search token for cx '${cx}'`);
		}

		if (GoogleCSEEngine.tokens.size >= GoogleCSEEngine.TOKEN_CACHE_MAX) {
			const oldest = GoogleCSEEngine.tokens.keys().next().value;
			if (oldest !== undefined) GoogleCSEEngine.tokens.delete(oldest);
		}
		GoogleCSEEngine.tokens.set(cx, { ...token, expires: Date.now() + GoogleCSEEngine.TOKEN_TTL_MS });
		return token;
	}

	/** Extract `cse_token`, `cselibVersion` and `exp` from the options `cse.js` is called with. */
	static parseToken(script: string): GoogleCSEEngine.Token | null {
		const token = script.match(/"cse_token"\s*:\s*"([^"]+)"/)?.[1];
		if (!token) return null;
		const exp = script.match(/"exp"\s*:\s*\[([^\]]*)\]/)?.[1];
		return {
			token,
			libVersion: script.match(/"cselibVersion"\s*:\s*"([^"]*)"/)?.[1] ?? "",
			exp: exp ? [...exp.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join(",") : "",
		};
	}

	/** Unwrap `/*O_o*\/ _({...});` into its JSON payload. */
	static parseJSONP(body: string): GoogleCSEEngine.Response | null {
		const start = body.indexOf("{");
		const end = body.lastIndexOf("}");
		if (start < 0 || end < start) return null;
		try {
			return JSON.parse(body.slice(start, end + 1));
		} catch {
			return null;
		}
	}

	/** `sort=date:r:<from>:<to>` restricts results to a date range (YYYYMMDD, UTC). */
	static dateRestrict(range: SearchTypes.TimeRange | null, now = Date.now()): string | null {
		if (!range) return null;
		const days = { day: 1, week: 7, month: 30, year: 365 }[range];
		const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
		return `date:r:${stamp(now - days * 86_400_000)}:${stamp(now)}`;
	}

	static parseResults(
		data: GoogleCSEEngine.Response,
		type: "web" | "image",
	): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of Array.isArray(data.results) ? data.results : []) {
			if (type === "image") {
				const url = SearchUtils.safeURL(item.originalContextUrl)?.toString();
				const image = SearchUtils.safeURL(item.unescapedUrl)?.toString();
				if (!url || !image) continue;
				const width = Number(item.width);
				const height = Number(item.height);
				results.push({
					url,
					title: SearchUtils.cleanText(item.titleNoFormatting),
					template: "image",
					imgSrc: image,
					thumbnail: SearchUtils.safeURL(item.tbUrl)?.toString() ?? image,
					width: width > 0 ? width : undefined,
					height: height > 0 ? height : undefined,
					source: SearchUtils.hostname(url),
				});
				continue;
			}

			const url = SearchUtils.safeURL(item.unescapedUrl ?? item.url)?.toString();
			if (!url) continue;
			const { content, publishedAt } = GoogleCSEEngine.splitDate(
				SearchUtils.cleanText(item.contentNoFormatting),
			);
			results.push({
				url,
				title: SearchUtils.cleanText(item.titleNoFormatting),
				content,
				publishedAt,
				thumbnail: SearchUtils.safeURL(item.richSnippet?.cseThumbnail?.src)?.toString(),
			});
		}
		return results;
	}

	/** Google prefixes dated snippets with `27 Feb 2019 ... ` / `Feb 27, 2019 ... ` / `3 days ago ... `. */
	static splitDate(snippet: string, now = Date.now()): { content: string; publishedAt?: number } {
		const match = snippet.match(/^(.{4,24}?)\s+\.\.\.\s+(.*)$/);
		if (!match) return { content: snippet };
		const prefix = match[1]!;
		let publishedAt: number | undefined;
		if (/\bago$/i.test(prefix)) {
			publishedAt = SearchUtils.parseRelativeTime(prefix, now);
		} else if (/^(\d{1,2} [a-z]{3,9}\.? \d{4}|[a-z]{3,9}\.? \d{1,2}, \d{4})$/i.test(prefix)) {
			const parsed = Date.parse(prefix);
			publishedAt = Number.isNaN(parsed) ? undefined : parsed;
		}
		return publishedAt === undefined ? { content: snippet } : { content: match[2]!, publishedAt };
	}
}

export namespace GoogleCSEEngine {
	export interface Token {
		token: string;
		libVersion: string;
		/** Comma separated experiment flags the element passes along (`exp`). */
		exp: string;
	}

	export interface Response {
		results?: any[];
		cursor?: { estimatedResultCount?: string };
		spelling?: { correctedQuery?: string };
		error?: { code?: number; message?: string };
	}
}
