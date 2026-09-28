import { z } from "zod";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";

/** Shared Bing plumbing: market cookies, safe search, and decoding of `bing.com/ck/a` links. */
export class BingCommon {
	/** Settings shared by all Bing engines. */
	static readonly Settings = z.object({
		market: z
			.string()
			.regex(/^([a-z]{2}-[a-z]{2})?$/i, "Use a market like `en-us`, or leave empty")
			.default("")
			.describe(
				"Bing market (e.g. `en-us`). Leave empty to let Bing use the exit IP's country — a market that does not match the exit IP makes Bing return unrelated results.",
			),
	});

	/**
	 * Safe search always; the market only when configured. Market/UI language have to go into the
	 * `_EDGE_*` cookies — the `setlang`/`cc`/`mkt` query params make Bing return an empty page.
	 */
	static cookies(safesearch: SearchTypes.SafeSearch, market = ""): Record<string, string> {
		const cookies: Record<string, string> = {
			SRCHHPGUSR: `ADLT=${["OFF", "DEMOTE", "STRICT"][safesearch]}`,
		};
		if (market) {
			const normalized = market.toLowerCase();
			const language = normalized.split("-")[0]!;
			cookies._EDGE_CD = `m=${normalized}&u=${language}`;
			cookies._EDGE_S = `mkt=${normalized}&ui=${language}`;
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
