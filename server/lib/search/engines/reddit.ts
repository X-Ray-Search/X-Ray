import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	sort: z
		.enum(["relevance", "hot", "top", "new", "comments"])
		.default("relevance")
		.describe("Order of Reddit's search results"),
});

/**
 * Reddit posts via the site-wide search Atom feed (`/search.rss`).
 *
 * The JSON API (`/search.json`) answers server traffic with HTTP 403 regardless of the User-Agent,
 * while the feed still works anonymously (as of 2026-09). The feed has no page offset — Reddit
 * pages with an `after` cursor — so page N requests `N × 25` entries (Reddit's cap is 100) and
 * keeps the last 25. Matching subreddits are listed before the posts.
 *
 * Anonymous feed requests are rate limited hard, per IP: the `X-Ratelimit-*` headers allow one
 * request per minute, the next one gets HTTP 429 (and sometimes a truncated feed first). Give the
 * instance proxies if it should answer more often.
 */
export class RedditEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "reddit",
		name: "Reddit",
		description: "Posts and subreddits from Reddit (search Atom feed).",
		website: "https://www.reddit.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: false },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 1,
	});

	private static readonly PAGE_SIZE = 25;
	private static readonly MAX_ENTRIES = 100;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const limit = RedditEngine.PAGE_SIZE * query.page;
		if (limit > RedditEngine.MAX_ENTRIES) return { results: [] };

		const params = new URLSearchParams({
			q: query.query,
			sort: this.settings.sort,
			t: query.timeRange ?? "all",
			include_over_18: query.safesearch === 0 ? "1" : "0",
			limit: String(limit),
		});
		const xml = await this.http.text(`https://www.reddit.com/search.rss?${params}`, {
			language: query.language,
			headers: { Accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.8" },
		});
		const results = RedditEngine.parseFeed(xml);
		return { results: results.slice((query.page - 1) * RedditEngine.PAGE_SIZE) };
	}

	/** Parse the Atom feed. Entries are posts (`t3_…`) or subreddits (`t5_…`). */
	static parseFeed(xml: string): SearchTypes.EngineResult[] {
		if (!/<feed[\s>]/.test(xml)) throw new EngineError("parse", "Reddit did not return an Atom feed");

		const results: SearchTypes.EngineResult[] = [];
		for (const [, block = ""] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
			const url = SearchUtils.safeURL(
				RedditEngine.decode(block.match(/<link\s[^>]*href="([^"]+)"/)?.[1]),
			)?.toString();
			const title = RedditEngine.decode(RedditEngine.tag(block, "title"));
			if (!url || !title) continue;

			// `content` is escaped HTML: decode once to get the markup.
			const html = RedditEngine.decode(RedditEngine.tag(block, "content"));
			const id = RedditEngine.tag(block, "id");
			const published = Date.parse(
				RedditEngine.tag(block, "published") || RedditEngine.tag(block, "updated"),
			);
			const thumbnail = RedditEngine.decode(block.match(/<media:thumbnail\s[^>]*url="([^"]+)"/)?.[1]);

			if (id.startsWith("t5_")) {
				const name = new URL(url).pathname.match(/^\/r\/([^/]+)/)?.[1];
				results.push({
					url,
					title,
					content: RedditEngine.text(html.replace(/<a\s[^>]*>\[link\]<\/a>/g, "")),
					source: name ? `r/${name}` : "Reddit",
					thumbnail: SearchUtils.safeURL(thumbnail)?.toString(),
				});
				continue;
			}

			// Self posts carry their body between SC_OFF/SC_ON; link posts only a `[link]` anchor.
			const body = html.match(/<!-- SC_OFF -->([\s\S]*?)<!-- SC_ON -->/)?.[1];
			const link = SearchUtils.safeURL(
				RedditEngine.decode(html.match(/<a href="([^"]+)">\[link\]<\/a>/)?.[1]),
			);
			const external = link && !/(^|\.)reddit\.com$|(^|\.)redd\.it$/.test(link.hostname);
			const author = RedditEngine.decode(RedditEngine.tag(block, "name")).replace(/^\/u\//, "");

			results.push({
				url,
				title,
				content: body
					? RedditEngine.text(body)
					: external
						? `Link to ${SearchUtils.hostname(link.toString())}`
						: "",
				publishedAt: Number.isNaN(published) ? undefined : published,
				author: author || undefined,
				source: RedditEngine.decode(block.match(/<category\s[^>]*label="([^"]*)"/)?.[1]) || "Reddit",
				thumbnail: SearchUtils.safeURL(thumbnail)?.toString(),
			});
		}
		return results;
	}

	private static tag(block: string, name: string): string {
		return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
	}

	/** Decode XML entities (and collapse whitespace). */
	private static decode(value: string | undefined): string {
		return SearchUtils.stripTags(value);
	}

	/** Plain-text excerpt of a post's HTML body. */
	private static text(html: string): string {
		return SearchUtils.excerpt(SearchUtils.stripTags(html));
	}
}
