import { type HTMLElement, parse as parseHTML } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../errors";
import type { EngineHttp } from "../http";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/**
 * Shared Yahoo plumbing: the bot-check cookie round trip, `r.search.yahoo.com` redirect links
 * and result dates.
 *
 * A cookie-less visit gets either `307 → /_bv/v.gif` (which redirects back once its cookies are
 * sent) or an empty `500` — both hand out the `YBV`/`A1`/`A3` cookies the next request needs.
 * Redirects are therefore followed by hand with a cookie jar, a first-contact 500 is retried
 * once, and the jar is kept per engine instance so later searches skip the round trip.
 */
export class YahooCommon {
	private static readonly jars = new Map<
		string,
		{ cookies: Record<string, string>; expires: number }
	>();
	private static readonly JAR_TTL_MS = 30 * 60_000;
	private static readonly JAR_CACHE_MAX = 100;
	private static readonly MAX_HOPS = 5;
	private static readonly REDIRECTS = [301, 302, 303, 307, 308];

	/** GET a Yahoo page, following (same-site) redirects manually so cookies are carried along. */
	static async fetchHTML(
		http: EngineHttp,
		jarKey: string,
		url: string,
		init: EngineHttp.RequestInit = {},
	): Promise<{ root: HTMLElement; raw: string }> {
		const cached = YahooCommon.jars.get(jarKey);
		const jar: Record<string, string> = {
			...(cached && cached.expires > Date.now() ? cached.cookies : {}),
		};

		let target = url;
		let retried = false;
		for (let hop = 0; hop < YahooCommon.MAX_HOPS; hop++) {
			const res = await http.request(target, {
				...init,
				cookies: { ...jar, ...init.cookies },
				redirect: "manual",
				acceptStatus: [...YahooCommon.REDIRECTS, 500],
			});
			const setCookies = res.headers.getSetCookie();
			for (const header of setCookies) {
				const pair = header.split(";", 1)[0]!;
				const index = pair.indexOf("=");
				if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
			}

			if (YahooCommon.REDIRECTS.includes(res.status)) {
				const location = res.headers.get("location");
				const next = SearchUtils.safeURL(location, target);
				if (!next?.hostname.endsWith(".yahoo.com")) {
					throw new EngineError("blocked", `Yahoo redirected to ${location ?? "nowhere"}`);
				}
				target = next.toString();
				continue;
			}
			if (res.status === 500) {
				if (!retried && setCookies.some((header) => header.startsWith("YBV="))) {
					retried = true;
					continue;
				}
				// Still failing with the bot-check cookies means Yahoo does not trust this client.
				const blocked = retried || target.includes("/_bv/");
				throw new EngineError(
					blocked ? "blocked" : "http",
					blocked ? "Yahoo bot check failed (HTTP 500)" : `HTTP 500 from ${new URL(target).host}`,
				);
			}

			let raw: string;
			try {
				raw = await res.text();
			} catch (err) {
				throw EngineError.from(err);
			}
			if (YahooCommon.jars.size >= YahooCommon.JAR_CACHE_MAX && !YahooCommon.jars.has(jarKey)) {
				const oldest = YahooCommon.jars.keys().next().value;
				if (oldest !== undefined) YahooCommon.jars.delete(oldest);
			}
			YahooCommon.jars.set(jarKey, { cookies: jar, expires: Date.now() + YahooCommon.JAR_TTL_MS });
			return { root: parseHTML(raw), raw };
		}
		throw new EngineError("blocked", "Yahoo kept redirecting (bot check)");
	}

	/** Unwrap `https://r.search.yahoo.com/_ylt=…/RU=<encoded target>/RK=2/RS=…`. */
	static resolveLink(href: string | undefined): string | null {
		const url = SearchUtils.safeURL(href);
		if (!url) return null;
		if (!url.hostname.endsWith("search.yahoo.com")) return url.toString();
		const match = url.pathname.match(/\/RU=([^/]+)\//);
		if (!match) return null;
		try {
			return SearchUtils.safeURL(decodeURIComponent(match[1]!))?.toString() ?? null;
		} catch {
			return null;
		}
	}

	/** `Sep 20, 2026 · `, `19 hours ago · ` → epoch ms. */
	static parseDate(text: string | undefined, now = Date.now()): number | undefined {
		const value = SearchUtils.cleanText(text).replace(/[\s·-]+$/, "");
		if (!value) return undefined;
		if (/\bago$/i.test(value)) return SearchUtils.parseRelativeTime(value, now);
		if (!/^([a-z]{3,9}\.? \d{1,2}, \d{4}|\d{1,2} [a-z]{3,9}\.? \d{4})$/i.test(value))
			return undefined;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	/** `p` of a Yahoo search link (`…/search;_ylt=…?p=linux+kernel`), or its text. */
	static linkQuery(link: HTMLElement): string {
		const url = SearchUtils.safeURL(link.getAttribute("href"));
		return SearchUtils.cleanText(url?.searchParams.get("p") ?? link.text);
	}
}

/**
 * Yahoo web search (results from Bing's index) via `search.yahoo.com`. Pages hold 7 results
 * (`b` is the 1-based offset); the `sB` preference cookie carries safe search and `vl` the
 * result language. Yahoo's time filter knows day/week/month only — `year` is searched
 * unfiltered. Usually lenient towards scrapers once the bot-check cookies are set.
 */
export class YahooEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "yahoo",
		name: "Yahoo",
		description: "Web results from Yahoo Search (Bing-backed).",
		website: "https://search.yahoo.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 30,
	});

	private static readonly PAGE_SIZE = 7;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const { language } = SearchUtils.parseLocale(query.language);
		const params = new URLSearchParams({ p: query.query, ei: "UTF-8", fl: "1" });
		if (language) params.set("vl", `lang_${language}`);
		if (query.page > 1) params.set("b", String((query.page - 1) * YahooEngine.PAGE_SIZE + 1));
		if (query.timeRange && query.timeRange !== "year") {
			params.set("btf", { day: "d", week: "w", month: "m" }[query.timeRange]);
			params.set("age", { day: "1d", week: "1w", month: "1m" }[query.timeRange]);
			params.set("fr2", "time");
		}

		// vm: r = strict, i = moderate, p = off.
		const preferences = new URLSearchParams({
			v: "1",
			vm: ["p", "i", "r"][query.safesearch]!,
			fl: "1",
			...(language ? { vl: `lang_${language}` } : {}),
			rw: "new",
			userset: "1",
		});
		const { root } = await YahooCommon.fetchHTML(
			this.http,
			this.config.slug,
			`https://search.yahoo.com/search?${params}`,
			{ language: query.language, cookies: { sB: preferences.toString() } },
		);

		const results = YahooEngine.parseResults(root);
		if (!results.length && !root.querySelector("#web")) {
			throw new EngineError("parse", "Yahoo returned an unrecognised page");
		}
		return {
			results,
			corrections: YahooEngine.parseCorrections(root),
			suggestions: YahooEngine.parseSuggestions(root),
		};
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll("div.algo-sr")) {
			if (item.closest("[class*=Ads]")) continue;
			const link = item.querySelector(".compTitle h3 a") ?? item.querySelector(".compTitle a");
			const url = YahooCommon.resolveLink(link?.getAttribute("href"));
			if (!link || !url) continue;

			// Regional sites put the title in `aria-label`, search.yahoo.com in the `h3`.
			const title =
				link.getAttribute("aria-label") ?? item.querySelector(".compTitle h3")?.text ?? link.text;

			const snippet = item.querySelector(".compText");
			const date = snippet?.querySelector(".fc-smoke");
			const publishedAt = YahooCommon.parseDate(date?.text);
			if (publishedAt !== undefined) date?.remove();

			results.push({
				url,
				title: SearchUtils.cleanText(title),
				content: SearchUtils.cleanText(snippet?.text),
				publishedAt,
			});
		}
		return results;
	}

	/** "Including results for <corrected query>" / "Did you mean". */
	static parseCorrections(root: HTMLElement): string[] {
		const link = root.querySelector(".Sugg .compTitle a");
		const correction = link ? YahooCommon.linkQuery(link) : "";
		return correction ? [correction] : [];
	}

	/** "Searches related to …". */
	static parseSuggestions(root: HTMLElement): string[] {
		const suggestions = root
			.querySelectorAll(".AlsoTry table a")
			.map((link) => SearchUtils.cleanText(link.text))
			.filter(Boolean);
		return [...new Set(suggestions)];
	}
}

/**
 * Yahoo News search via `news.search.yahoo.com` — articles from Yahoo's publishing partners
 * with source, relative date and thumbnail. Pages hold 10 articles; there are no time,
 * language or safe-search filters.
 */
export class YahooNewsEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "yahoo_news",
		name: "Yahoo News",
		description: "News articles from Yahoo News search.",
		website: "https://news.search.yahoo.com",
		categories: ["news"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: false, language: false },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 30,
	});

	private static readonly PAGE_SIZE = 10;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({ p: query.query, ei: "UTF-8" });
		if (query.page > 1) params.set("b", String((query.page - 1) * YahooNewsEngine.PAGE_SIZE + 1));

		const { root } = await YahooCommon.fetchHTML(
			this.http,
			this.config.slug,
			`https://news.search.yahoo.com/search?${params}`,
			{ language: query.language },
		);

		const results = YahooNewsEngine.parseResults(root);
		if (!results.length && !root.querySelector("#web")) {
			throw new EngineError("parse", "Yahoo News returned an unrecognised page");
		}
		return { results };
	}

	static parseResults(root: HTMLElement, now = Date.now()): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll("ol.searchCenterMiddle > li")) {
			const link = item.querySelector("h4 a");
			const url = YahooCommon.resolveLink(link?.getAttribute("href"));
			if (!link || !url) continue;

			// The heading is cut off with "…"; the thumbnail link carries the full title.
			const thumbnailLink = item.querySelector("a.thmb");
			const image = thumbnailLink?.querySelector("img");
			const source = item.querySelector(".s-source");
			source?.querySelector(".s-via")?.remove();

			results.push({
				url,
				title: SearchUtils.cleanText(thumbnailLink?.getAttribute("title") ?? link.text),
				content: SearchUtils.cleanText(item.querySelector(".s-desc")?.text),
				template: "news",
				publishedAt: YahooCommon.parseDate(item.querySelector(".s-time")?.text, now),
				thumbnail: SearchUtils.safeURL(
					image?.getAttribute("data-src") ?? image?.getAttribute("src"),
				)?.toString(),
				source: SearchUtils.cleanText(source?.text) || SearchUtils.hostname(url),
			});
		}
		return results;
	}
}
