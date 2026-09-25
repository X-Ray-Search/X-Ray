import { EngineError } from "../../errors";
import type { EngineHttp } from "../../http";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";

/** Shared DuckDuckGo plumbing: region codes, safe-search/time mapping and the `vqd` token. */
export class DuckDuckGoCommon {
	private static readonly vqdCache = new Map<string, { vqd: string; expires: number }>();
	private static readonly VQD_TTL_MS = 30 * 60_000;
	private static readonly VQD_CACHE_MAX = 500;

	/** DuckDuckGo `kl` region code, e.g. `us-en`, `de-de`, `wt-wt` (no region). */
	static region(locale: string, override?: string): string {
		if (override && override !== "auto") return override;
		const { language, region } = SearchUtils.parseLocale(locale);
		if (!language) return "wt-wt";
		const country = (region ?? SearchUtils.defaultRegion(language)).toLowerCase();
		return `${country === "gb" ? "uk" : country}-${language}`;
	}

	/** `kp` values: 1 strict, -1 moderate, -2 off. */
	static safeSearch(level: SearchTypes.SafeSearch): string {
		return level === 2 ? "1" : level === 1 ? "-1" : "-2";
	}

	static timeRange(range: SearchTypes.TimeRange | null): string {
		return range ? { day: "d", week: "w", month: "m", year: "y" }[range] : "";
	}

	/** The `vqd` token DuckDuckGo requires for its JSON endpoints (images/news/videos). */
	static async getVQD(http: EngineHttp, query: string, region: string): Promise<string> {
		const key = `${region}|${query}`;
		const now = Date.now();
		const cached = this.vqdCache.get(key);
		if (cached && cached.expires > now) return cached.vqd;

		const html = await http.text(
			`https://duckduckgo.com/?${new URLSearchParams({ q: query, kl: region, ia: "web" })}`,
			{ acceptStatus: [202] },
		);
		const vqd =
			html.match(/vqd=["']?(\d+-[\d-]+)["']?/)?.[1] ?? html.match(/"vqd":"(\d+-[\d-]+)"/)?.[1];
		if (!vqd) {
			throw new EngineError("blocked", "DuckDuckGo did not return a vqd token (likely rate limited)");
		}

		if (this.vqdCache.size >= this.VQD_CACHE_MAX) {
			const oldest = this.vqdCache.keys().next().value;
			if (oldest !== undefined) this.vqdCache.delete(oldest);
		}
		this.vqdCache.set(key, { vqd, expires: now + this.VQD_TTL_MS });
		return vqd;
	}

	/** Headers DuckDuckGo's JSON endpoints expect from its own frontend (they 403 without). */
	static readonly JSON_HEADERS = {
		Referer: "https://duckduckgo.com/",
		"Sec-Fetch-Dest": "empty",
		"Sec-Fetch-Mode": "cors",
		"Sec-Fetch-Site": "same-origin",
		"X-Requested-With": "XMLHttpRequest",
	};
}
