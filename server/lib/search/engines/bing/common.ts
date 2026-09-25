import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";

/** Shared Bing plumbing: market cookies, safe search, and decoding of `bing.com/ck/a` links. */
export class BingCommon {
	/**
	 * Market/UI language go into the `_EDGE_*` cookies — the `setlang`/`cc`/`mkt` query params
	 * make Bing return an empty result page for non-browser clients.
	 */
	static cookies(locale: string, safesearch: SearchTypes.SafeSearch): Record<string, string> {
		const cookies: Record<string, string> = {
			SRCHHPGUSR: `ADLT=${["OFF", "DEMOTE", "STRICT"][safesearch]}`,
		};
		const { language, region } = SearchUtils.parseLocale(locale);
		if (language) {
			const market = `${language}-${(region ?? SearchUtils.defaultRegion(language)).toLowerCase()}`;
			cookies._EDGE_CD = `m=${market}&u=${language}`;
			cookies._EDGE_S = `mkt=${market}&ui=${language}`;
		}
		return cookies;
	}

	/** Bing wraps result links as `bing.com/ck/a?...&u=a1<base64url(target)>`. */
	static resolveLink(href: string | undefined): string | null {
		const url = SearchUtils.safeURL(href?.replace(/&amp;/g, "&"), "https://www.bing.com");
		if (!url) return null;
		if (url.hostname.endsWith("bing.com") && url.pathname.startsWith("/ck/")) {
			const encoded = url.searchParams.get("u");
			if (!encoded?.startsWith("a1")) return null;
			try {
				const decoded = Buffer.from(
					encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf8");
				return SearchUtils.safeURL(decoded)?.toString() ?? null;
			} catch {
				return null;
			}
		}
		return url.toString();
	}

	/** `filters=ex1:"ez1"` (day), ez2 (week), ez3 (month), ez5_<from>_<to> (days since epoch). */
	static timeFilter(range: SearchTypes.TimeRange | null): string | null {
		if (!range) return null;
		if (range === "year") {
			const today = Math.floor(Date.now() / 86_400_000);
			return `ex1:"ez5_${today - 365}_${today}"`;
		}
		return `ex1:"ez${{ day: 1, week: 2, month: 3 }[range]}"`;
	}
}
