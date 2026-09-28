import { createHash } from "node:crypto";
import { z } from "zod";
import { EngineError } from "../../errors";
import type { EngineHttp } from "../../http";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";

/**
 * Solver for the [Anubis](https://github.com/TecharoHQ/anubis) proof-of-work gate Startpage puts
 * in front of `/sp/search`. The gate answers a search with a challenge page instead of results;
 * solving it yields an auth cookie (`spchal-auth`, a JWT valid for 5 minutes) that is bound to
 * the exit IP and user agent. The cookie is cached per process and route, so all Startpage
 * instances that share proxies and user agent pass the gate once.
 *
 * Since Anubis 1.2x the pass endpoint also requires the `…-cookie-verification` cookie set by
 * the challenge page — without it the challenge is rejected with HTTP 500.
 */
export class StartpageAnubis {
	private static readonly CHALLENGE_TAG = 'id="anubis_challenge"';
	private static readonly CHALLENGE_JSON = /<script id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/;
	private static readonly PASS_PATH = "/.within.website/x/cmd/anubis/api/pass-challenge";
	/** Startpage's name for Anubis' auth cookie (upstream default: `techaro.lol-anubis-auth`). */
	static readonly AUTH_COOKIE = "spchal-auth";
	/** Lifetime assumed when the auth cookie carries no expiry. */
	private static readonly AUTH_TTL_MS = 4 * 60_000;
	/** Stop sending the auth cookie this long before it expires. */
	private static readonly EXPIRY_MARGIN_MS = 60_000;
	/** Give up after this many times the expected number of attempts. */
	private static readonly NONCE_HEADROOM = 8;
	/** Hash this many nonces between event-loop yields, so a solve doesn't stall the server. */
	private static readonly YIELD_EVERY = 20_000;

	private static readonly passes = new Map<string, { value: string; expires: number }>();

	static isChallenge(html: string): boolean {
		return html.includes(StartpageAnubis.CHALLENGE_TAG);
	}

	/** The challenge embedded in an Anubis page, or null if it can't be read. */
	static readChallenge(html: string): StartpageAnubis.Challenge | null {
		const match = html.match(StartpageAnubis.CHALLENGE_JSON);
		if (!match) return null;
		let payload: any;
		try {
			payload = JSON.parse(match[1] ?? "");
		} catch {
			return null;
		}
		// Anubis < 1.20 sends the random data as a bare string and has no challenge ids.
		const challenge = payload?.challenge;
		const randomData = typeof challenge === "string" ? challenge : challenge?.randomData;
		const id = typeof challenge?.id === "string" ? challenge.id : undefined;
		const difficulty = payload?.rules?.difficulty;
		if (typeof randomData !== "string" || !randomData) return null;
		if (!Number.isInteger(difficulty) || difficulty < 1) return null;
		return { id, randomData, difficulty, algorithm: payload?.rules?.algorithm };
	}

	/** Find a nonce so that `sha256(randomData + nonce)` starts with `difficulty` zero hex digits. */
	static async solve(
		randomData: string,
		difficulty: number,
	): Promise<StartpageAnubis.Solution | null> {
		const started = Date.now();
		const prefix = "0".repeat(difficulty);
		const limit = 16 ** difficulty * StartpageAnubis.NONCE_HEADROOM;
		for (let nonce = 0; nonce <= limit; nonce++) {
			const hash = createHash("sha256").update(`${randomData}${nonce}`).digest("hex");
			if (hash.startsWith(prefix)) {
				return { nonce, hash, elapsedMs: Math.max(1, Date.now() - started) };
			}
			if (nonce % StartpageAnubis.YIELD_EVERY === StartpageAnubis.YIELD_EVERY - 1) {
				await new Promise((resolve) => setImmediate(resolve));
			}
		}
		return null;
	}

	/** The cached auth cookie of a route, as a cookie jar entry (empty if none is fresh). */
	static cookies(route: string, now = Date.now()): Record<string, string> {
		const pass = StartpageAnubis.passes.get(route);
		if (!pass) return {};
		if (pass.expires <= now) {
			StartpageAnubis.passes.delete(route);
			return {};
		}
		return { [StartpageAnubis.AUTH_COOKIE]: pass.value };
	}

	/**
	 * Solve the challenge on `page` (the gated response to a request for `redirect`) and cache the
	 * resulting auth cookie for `route`. `options.cookies` is the jar the gated request was sent
	 * with; the challenge page's own cookies (`page.setCookies`) are added to it.
	 */
	static async pass(
		http: EngineHttp,
		route: string,
		page: { html: string; setCookies: Record<string, string> },
		redirect: string,
		options: { maxDifficulty: number; cookies: Record<string, string> },
	): Promise<void> {
		const challenge = StartpageAnubis.readChallenge(page.html);
		if (!challenge) {
			throw new EngineError("parse", "Startpage served an Anubis challenge that could not be read");
		}
		if (challenge.difficulty > options.maxDifficulty) {
			throw new EngineError(
				"blocked",
				`Startpage raised the Anubis difficulty to ${challenge.difficulty} (limit: ${options.maxDifficulty})`,
			);
		}
		const solution = await StartpageAnubis.solve(challenge.randomData, challenge.difficulty);
		if (!solution) {
			throw new EngineError("blocked", `No Anubis nonce found at difficulty ${challenge.difficulty}`);
		}

		const params = new URLSearchParams({
			response: solution.hash,
			nonce: String(solution.nonce),
			redir: redirect,
			elapsedTime: String(solution.elapsedMs),
		});
		if (challenge.id) params.set("id", challenge.id);
		const res = await http.request(
			`${StartpageCommon.BASE_URL}${StartpageAnubis.PASS_PATH}?${params}`,
			{
				redirect: "manual",
				cookies: { ...options.cookies, ...page.setCookies },
				headers: {
					...StartpageCommon.NAVIGATION_HEADERS,
					"Sec-Fetch-Site": "same-origin",
					Referer: redirect,
				},
				acceptStatus: [302, 303, 307, 400, 401, 500],
			},
		);
		await res.body?.cancel().catch(() => undefined);

		const auth = StartpageAnubis.parseSetCookies(res.headers)[StartpageAnubis.AUTH_COOKIE];
		if (!auth?.value) {
			throw new EngineError("blocked", `Startpage rejected the Anubis solution (HTTP ${res.status})`);
		}
		const now = Date.now();
		const expires = auth.expires
			? auth.expires - StartpageAnubis.EXPIRY_MARGIN_MS
			: now + StartpageAnubis.AUTH_TTL_MS;
		StartpageAnubis.passes.set(route, {
			value: auth.value,
			expires: Math.max(expires, now + 10_000),
		});
	}

	/** Non-empty cookies of a response with their expiry (epoch ms), by name. */
	static parseSetCookies(
		headers: Headers,
		now = Date.now(),
	): Record<string, { value: string; expires?: number }> {
		const cookies: Record<string, { value: string; expires?: number }> = {};
		for (const line of headers.getSetCookie()) {
			const [pair = "", ...attributes] = line.split(";");
			const separator = pair.indexOf("=");
			if (separator < 1) continue;
			const name = pair.slice(0, separator).trim();
			const value = pair.slice(separator + 1).trim();
			if (!value) continue;

			let expires: number | undefined;
			for (const attribute of attributes) {
				const [key = "", raw = ""] = attribute.split("=", 2).map((part) => part.trim());
				if (/^max-age$/i.test(key) && Number.isFinite(Number(raw))) {
					expires = now + Number(raw) * 1000;
					break;
				}
				if (/^expires$/i.test(key) && !Number.isNaN(Date.parse(raw))) expires = Date.parse(raw);
			}
			cookies[name] = { value, expires };
		}
		return cookies;
	}
}

export namespace StartpageAnubis {
	export interface Challenge {
		/** Server-side challenge id (Anubis ≥ 1.20). */
		id?: string;
		randomData: string;
		/** Required number of leading zero hex digits. */
		difficulty: number;
		algorithm?: string;
	}

	export interface Solution {
		nonce: number;
		/** Hex SHA-256 of `randomData + nonce`. */
		hash: string;
		elapsedMs: number;
	}
}

/**
 * Shared Startpage plumbing: settings, the `preferences` cookie, locale/safe-search mapping,
 * extraction of the SERP props embedded in the page and helpers for the result fields.
 */
export class StartpageCommon {
	static readonly BASE_URL = "https://www.startpage.com";
	static readonly SEARCH_URL = `${StartpageCommon.BASE_URL}/sp/search`;

	/** Settings shared by all Startpage engines. */
	static readonly Settings = z.object({
		anonymous_view: z
			.boolean()
			.default(false)
			.describe(
				"Link results through Startpage's Anonymous View proxy, so the destination site does not see the visitor's IP. Proxied links don't merge with other engines' copies of the same result.",
			),
		solve_anubis: z
			.boolean()
			.default(true)
			.describe(
				"Solve the Anubis proof-of-work gate Startpage puts in front of search (about 50–200 ms of CPU at difficulty 4, then reused for about four minutes). Without it, gated searches fail as blocked.",
			),
		anubis_max_difficulty: z
			.number()
			.int()
			.min(1)
			.max(8)
			.default(4)
			.describe(
				"Refuse Anubis challenges harder than this instead of burning CPU. Startpage serves difficulty 4; each step multiplies the work by 16.",
			),
	});

	/** Headers of a top-level navigation, as a browser sends them (plus `Sec-Fetch-Site`). */
	static readonly NAVIGATION_HEADERS = {
		"Sec-Fetch-Dest": "document",
		"Sec-Fetch-Mode": "navigate",
		"Sec-Fetch-User": "?1",
		"Upgrade-Insecure-Requests": "1",
	};

	/** Startpage's search languages (`language` preference), by ISO 639-1 code. */
	private static readonly LANGUAGES: Record<string, string> = {
		da: "dansk",
		de: "deutsch",
		en: "english",
		es: "espanol",
		fr: "francais",
		ja: "nihongo",
		nb: "norsk",
		nl: "nederlands",
		nn: "norsk",
		no: "norsk",
		pl: "polski",
		pt: "portugues",
		sv: "svenska",
	};

	/** Startpage's result regions (`search_results_region` / `qsr`), from its settings page. */
	// biome-ignore format: keep the region table compact
	private static readonly REGIONS = new Set([
		"es_AR", "en_AU", "de_AT", "ru_BY", "fr_BE", "nl_BE", "pt-BR_BR", "bg_BG", "en_CA", "fr_CA",
		"es_CL", "zh-CN_CN", "es_CO", "cs_CZ", "da_DK", "ar_EG", "et_EE", "fi_FI", "fr_FR", "de_DE",
		"el_GR", "zh-TW_HK", "hu_HU", "en_IN", "hi_IN", "en_ID", "id_ID", "en_IE", "it_IT", "ja_JP",
		"ko_KR", "en_MY", "ms_MY", "es_MX", "nl_NL", "en_NZ", "no_NO", "es_PE", "en_PH", "fil_PH",
		"pl_PL", "pt_PT", "ro_RO", "ru_RU", "en_SG", "ms_SG", "en_ZA", "ca_ES", "es_ES", "sv_SE",
		"de_CH", "fr_CH", "it_CH", "zh-TW_TW", "tr_TR", "uk_UA", "en-GB_GB", "es_UY", "en_US", "es_US",
		"es_VE", "en_VN", "vi_VN",
	]);

	private static readonly CAPTCHA_MARKERS = [
		"/sp/captcha",
		"Startpage Captcha",
		"CAPTCHA Verification",
		"captcha-section",
	];
	private static readonly SUSPENDED_MARKERS = [
		"Access Denied - Startpage",
		"error-pages/blocked.html",
	];

	/** Search language; Startpage has no "any language" option and defaults to English. */
	static language(locale: string): string {
		const { language } = SearchUtils.parseLocale(locale);
		return StartpageCommon.LANGUAGES[language ?? ""] ?? "english";
	}

	/** Result region code (`en_US`, `en-GB_GB`, …) for a locale, or `all`. */
	static region(locale: string): string {
		const parsed = SearchUtils.parseLocale(locale);
		if (!parsed.language) return "all";
		const language = parsed.language === "nb" || parsed.language === "nn" ? "no" : parsed.language;
		const country = parsed.region ?? SearchUtils.defaultRegion(language);
		if (StartpageCommon.REGIONS.has(`${language}_${country}`)) return `${language}_${country}`;
		for (const code of StartpageCommon.REGIONS) {
			const [prefix = "", codeCountry] = code.split("_");
			if (codeCountry === country && prefix.split("-")[0] === language) return code;
		}
		return "all";
	}

	/** `qadf` / `disable_family_filter` value. */
	static safeSearch(level: SearchTypes.SafeSearch): string {
		return (["none", "moderate", "heavy"] as const)[level];
	}

	/** `with_date` value. */
	static timeRange(range: SearchTypes.TimeRange | null): string {
		return range ? { day: "d", week: "w", month: "m", year: "y" }[range] : "";
	}

	/**
	 * The `preferences` cookie (`keyEEEvalue` pairs joined by `N1N`). The UI language stays English
	 * so relative dates ("3 days ago") and pagination labels parse the same for every locale.
	 */
	static preferences(query: SearchTypes.EngineQuery): string {
		const preferences: Record<string, string> = {
			date_time: "world",
			disable_family_filter: StartpageCommon.safeSearch(query.safesearch),
			disable_open_in_new_window: "0",
			enable_post_method: "1",
			enable_proxy_safety_suggest: "0",
			enable_stay_control: "0",
			instant_answers: "1",
			lang_homepage: encodeURIComponent("s/device/en"),
			language: StartpageCommon.language(query.language),
			language_ui: "english",
			num_of_results: "20",
			search_results_region: StartpageCommon.region(query.language),
			suggestions: "1",
			wt_unit: "celsius",
		};
		return Object.entries(preferences)
			.map(([key, value]) => `${key}EEE${value}`)
			.join("N1N");
	}

	/** Throw `blocked` for Startpage's captcha and IP-suspension pages. */
	static assertNotBlocked(html: string, url = ""): void {
		const head = html.slice(0, 8000);
		if (
			url.includes("/sp/captcha") ||
			StartpageCommon.CAPTCHA_MARKERS.some((marker) => head.includes(marker))
		) {
			throw new EngineError("blocked", "Startpage presented a captcha");
		}
		if (StartpageCommon.SUSPENDED_MARKERS.some((marker) => head.includes(marker))) {
			throw new EngineError("blocked", "Startpage suspended this IP for suspected scraping");
		}
	}

	/**
	 * The props of `React.createElement(UIStartpage.<app>, {...})` — the SERP data the page
	 * hydrates from. Scans for the balanced object instead of matching the line with a regex,
	 * since the JSON may contain characters (e.g. U+2028) that end a regex line.
	 */
	static extractSerp(html: string, app: string): StartpageCommon.Serp | null {
		const marker = `React.createElement(UIStartpage.${app},`;
		const at = html.indexOf(marker);
		if (at < 0) return null;
		const start = html.indexOf("{", at + marker.length);
		if (start < 0) return null;

		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let i = start; i < html.length; i++) {
			const char = html[i];
			if (inString) {
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === '"') inString = false;
			} else if (char === '"') {
				inString = true;
			} else if (char === "{") {
				depth++;
			} else if (char === "}") {
				depth--;
				if (depth > 0) continue;
				try {
					return JSON.parse(html.slice(start, i + 1));
				} catch {
					return null;
				}
			}
		}
		return null;
	}

	/** Results of the mainline blocks whose `display_type` starts with `prefix` (`web-`, …). */
	static items(serp: StartpageCommon.Serp, prefix: string): any[] {
		const mainline = serp.render?.presenter?.regions?.mainline ?? [];
		return mainline
			.filter((block) => block?.display_type?.startsWith(prefix) && Array.isArray(block.results))
			.flatMap((block) => block.results ?? []);
	}

	/**
	 * Absolute http(s) URL of a result field. Startpage-internal wrappers are unwrapped:
	 * `/av/proxy-image?piurl=` (signed, expiring image proxy — X-Ray proxies images itself) and
	 * `/do/d/search?url=`; other links to Startpage itself are dropped.
	 */
	static resultURL(value: unknown): string | undefined {
		if (typeof value !== "string") return undefined;
		const url = SearchUtils.safeURL(value, StartpageCommon.BASE_URL);
		if (!url) return undefined;
		if (url.hostname === "startpage.com" || url.hostname.endsWith(".startpage.com")) {
			const target = url.searchParams.get("piurl") ?? url.searchParams.get("url");
			return SearchUtils.safeURL(target)?.toString();
		}
		return url.toString();
	}

	/** An Anonymous View link (`*.startpage.com/av/proxy?...`), if the field holds one. */
	static anonymousURL(value: unknown): string | undefined {
		if (typeof value !== "string") return undefined;
		const url = SearchUtils.safeURL(value);
		return url?.hostname.endsWith(".startpage.com") ? url.toString() : undefined;
	}

	/** Plain text of a field that may carry `<b>` highlights, entities and private-use markers. */
	static text(value: unknown): string {
		return typeof value === "string" ? SearchUtils.stripTags(value.replace(/[]/g, "")) : "";
	}

	/** Epoch ms of an absolute date (`2026-09-25`, `Thu, 25 May 2023`, `27 Feb 2019`), read as UTC. */
	static parseDate(value: unknown): number | undefined {
		if (typeof value !== "string" || !value.trim()) return undefined;
		const text = value.trim();
		const parsed = /^\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(text) : Date.parse(`${text} UTC`);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	/** Epoch ms of `naturalizedDateParts` (`{ format: "{0} hours ago", args: ["14"] }`). */
	static parseNaturalDate(parts: any, now = Date.now()): number | undefined {
		if (typeof parts?.format !== "string") return undefined;
		const args: unknown[] = Array.isArray(parts.args) ? parts.args : [];
		const text = parts.format.replace(/\{(\d+)\}/g, (_: string, index: string) =>
			String(args[Number(index)] ?? ""),
		);
		return SearchUtils.parseRelativeTime(text, now);
	}
}

export namespace StartpageCommon {
	export type Settings = z.infer<typeof StartpageCommon.Settings>;

	/** The parts of the SERP props the engines read. */
	export interface Serp {
		render?: {
			/** Token that authorizes the next (POST) search from this page. */
			search_sc?: string;
			segment?: string;
			presenter?: {
				regions?: { mainline?: { display_type?: string; results?: any[] }[] };
				pagination?: { pages?: { number?: number; nextPrev?: boolean; token?: string }[] };
			};
		};
	}

	/** State needed to request the following pages of a search. */
	export interface Session {
		sc: string;
		segment: string;
		/** `page_token` by page number (only paginations backed by YouTube use them). */
		tokens: Record<number, string>;
		expires: number;
	}
}

/**
 * Request flow shared by the Startpage engines. Page 1 is a plain GET; later pages are POSTs of
 * the search form carrying the `sc` token of the previous page (and, for videos, the Next
 * button's `page_token`), so each response's token is cached per search. A follow-up page
 * without a cached token first loads page 1 to get one. Every request passes the Anubis gate
 * (see {@link StartpageAnubis}) and is checked for captcha / suspension pages.
 */
export abstract class StartpageSerpEngine extends SearchEngine<StartpageCommon.Settings> {
	/** Startpage's `cat` parameter. */
	protected abstract readonly startpageCategory: "web" | "pics" | "news" | "video";
	/** The React app whose props hold the results (`AppSerpWeb`, …). */
	protected abstract readonly app: string;
	/** Whether Startpage honours `with_date` for this category. */
	protected abstract readonly supportsTimeRange: boolean;
	/** Pages are chained by `page_token`, so page N needs page N-1 (can't bootstrap from page 1). */
	protected readonly tokenPaging: boolean = false;

	protected abstract parse(serp: StartpageCommon.Serp): SearchTypes.EngineResult[];

	private static readonly sessions = new Map<string, StartpageCommon.Session>();
	private static readonly SESSION_TTL_MS = 10 * 60_000;
	private static readonly SESSIONS_MAX = 500;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const key = this.sessionKey(query);
		let serp: StartpageCommon.Serp;
		if (query.page === 1) {
			serp = await this.load(query, this.firstPage(query));
		} else {
			let session = this.session(key);
			if (!session && (query.page === 2 || !this.tokenPaging)) {
				session = this.remember(key, await this.load(query, this.firstPage(query)), 1);
			}
			const token = session?.tokens[query.page];
			if (!session || (this.tokenPaging && !token)) return { results: [] };
			serp = await this.load(query, this.followingPage(query, session, token));
		}
		this.remember(key, serp, query.page);
		return { results: this.parse(serp) };
	}

	/** Parameters both the GET and the POST form carry. */
	private filters(query: SearchTypes.EngineQuery): Record<string, string> {
		const filters: Record<string, string> = {
			query: query.query,
			cat: this.startpageCategory,
			language: StartpageCommon.language(query.language),
			lui: "english",
			qadf: StartpageCommon.safeSearch(query.safesearch),
			qsr: StartpageCommon.region(query.language),
		};
		const date = this.supportsTimeRange ? StartpageCommon.timeRange(query.timeRange) : "";
		if (date) filters.with_date = date;
		return filters;
	}

	private firstPage(query: SearchTypes.EngineQuery): StartpageSerpEngine.PageRequest {
		const params = new URLSearchParams({ ...this.filters(query), pl: "opensearch" });
		return {
			url: `${StartpageCommon.SEARCH_URL}?${params}`,
			init: { headers: { "Sec-Fetch-Site": "none" } },
		};
	}

	private followingPage(
		query: SearchTypes.EngineQuery,
		session: StartpageCommon.Session,
		token: string | undefined,
	): StartpageSerpEngine.PageRequest {
		const form: Record<string, string> = {
			...this.filters(query),
			sc: session.sc,
			t: "device",
			segment: session.segment,
			abd: "0",
			abe: "0",
			page: String(query.page),
		};
		if (token) form.page_token = token;
		return {
			url: StartpageCommon.SEARCH_URL,
			init: {
				form,
				headers: {
					"Sec-Fetch-Site": "same-origin",
					Origin: StartpageCommon.BASE_URL,
					Referer: `${StartpageCommon.BASE_URL}/`,
				},
			},
		};
	}

	/** Fetch a SERP page, passing the Anubis gate if it stands in the way. */
	private async load(
		query: SearchTypes.EngineQuery,
		request: StartpageSerpEngine.PageRequest,
	): Promise<StartpageCommon.Serp> {
		const route = `${this.config.proxyIds.join(",")}|${this.http.userAgent}`;
		const preferences = { preferences: StartpageCommon.preferences(query) };
		const open = () => {
			const cookies = { ...preferences, ...StartpageAnubis.cookies(route) };
			return this.fetchPage(request.url, {
				...request.init,
				language: query.language,
				cookies,
				headers: { ...StartpageCommon.NAVIGATION_HEADERS, ...request.init.headers },
			}).then((page) => ({ ...page, cookies }));
		};

		let page = await open();
		if (StartpageAnubis.isChallenge(page.html)) {
			if (!this.settings.solve_anubis) {
				throw new EngineError(
					"blocked",
					"Startpage served an Anubis proof-of-work challenge and solving is disabled",
				);
			}
			await StartpageAnubis.pass(this.http, route, page, request.url, {
				maxDifficulty: this.settings.anubis_max_difficulty,
				cookies: page.cookies,
			});
			page = await open();
			if (StartpageAnubis.isChallenge(page.html)) {
				throw new EngineError("blocked", "Startpage re-served the Anubis challenge after solving it");
			}
		}

		StartpageCommon.assertNotBlocked(page.html, page.url);
		const serp = StartpageCommon.extractSerp(page.html, this.app);
		if (!serp) throw new EngineError("parse", "Startpage returned a page without result data");
		if (!Array.isArray(serp.render?.presenter?.regions?.mainline)) {
			throw new EngineError("parse", "Startpage response layout was not recognised");
		}
		return serp;
	}

	private async fetchPage(url: string, init: EngineHttp.RequestInit) {
		const res = await this.http.request(url, init);
		try {
			const html = await res.text();
			const setCookies: Record<string, string> = {};
			for (const [name, cookie] of Object.entries(StartpageAnubis.parseSetCookies(res.headers))) {
				setCookies[name] = cookie.value;
			}
			return { html, url: res.url, setCookies };
		} catch (err) {
			throw EngineError.from(err);
		}
	}

	private sessionKey(query: SearchTypes.EngineQuery): string {
		return [
			this.config.proxyIds.join(","),
			this.http.userAgent,
			this.startpageCategory,
			query.query,
			query.language,
			query.safesearch,
			this.supportsTimeRange ? query.timeRange : null,
		].join("|");
	}

	private session(key: string): StartpageCommon.Session | undefined {
		const sessions = StartpageSerpEngine.sessions;
		const session = sessions.get(key);
		if (session && session.expires <= Date.now()) {
			sessions.delete(key);
			return undefined;
		}
		return session;
	}

	/** Store the continuation of `page` (its `sc` token and the next page's `page_token`). */
	private remember(
		key: string,
		serp: StartpageCommon.Serp,
		page: number,
	): StartpageCommon.Session | undefined {
		const sessions = StartpageSerpEngine.sessions;
		const sc = serp.render?.search_sc;
		if (!sc) return this.session(key);

		const next = serp.render?.presenter?.pagination?.pages?.find(
			(entry) => entry.nextPrev && entry.number === page + 1,
		);
		const session: StartpageCommon.Session = {
			sc,
			segment: serp.render?.segment || "startpage.udog",
			tokens: { ...this.session(key)?.tokens },
			expires: Date.now() + StartpageSerpEngine.SESSION_TTL_MS,
		};
		if (next?.token) session.tokens[page + 1] = next.token;

		sessions.delete(key);
		sessions.set(key, session);
		if (sessions.size > StartpageSerpEngine.SESSIONS_MAX) {
			const oldest = sessions.keys().next().value;
			if (oldest !== undefined) sessions.delete(oldest);
		}
		return session;
	}
}

export namespace StartpageSerpEngine {
	export interface PageRequest {
		url: string;
		init: EngineHttp.RequestInit;
	}
}
