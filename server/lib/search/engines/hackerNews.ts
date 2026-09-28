import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	min_points: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe("Hide stories with fewer points (0 = show all). Useful against spam in News."),
});

/**
 * Hacker News stories via the Algolia HN Search API (hn.algolia.com, no key, generous limits).
 *
 * General uses the relevance endpoint (`search`), News uses `search_by_date` so the newest
 * matching stories come first. Time ranges become a `created_at_i` numeric filter on either.
 * Results link to the story's URL; Ask/Show HN posts without one link to the HN item.
 */
export class HackerNewsEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "hackernews",
		name: "Hacker News",
		description: "Stories from Hacker News (Algolia HN Search API).",
		website: "https://news.ycombinator.com",
		categories: ["general", "news"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: false, language: false },
	});

	private static readonly PAGE_SIZE = 20;

	private static readonly TIME_RANGES: Record<SearchTypes.TimeRange, number> = {
		day: 86_400,
		week: 7 * 86_400,
		month: 30 * 86_400,
		year: 365 * 86_400,
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({
			query: query.query,
			tags: "story",
			hitsPerPage: String(HackerNewsEngine.PAGE_SIZE),
			page: String(query.page - 1),
		});
		const filters: string[] = [];
		if (query.timeRange) {
			const since = Math.floor(Date.now() / 1000) - HackerNewsEngine.TIME_RANGES[query.timeRange];
			filters.push(`created_at_i>${since}`);
		}
		if (this.settings.min_points > 0) filters.push(`points>=${this.settings.min_points}`);
		if (filters.length) params.set("numericFilters", filters.join(","));

		const endpoint = query.category === "news" ? "search_by_date" : "search";
		const data = await this.http.json<HackerNewsEngine.Response>(
			`https://hn.algolia.com/api/v1/${endpoint}?${params}`,
			{ headers: { Accept: "application/json" } },
		);
		return {
			results: HackerNewsEngine.parseResults(data, query.category === "news" ? "news" : "web"),
			totalResults: data.nbHits,
		};
	}

	static parseResults(
		data: HackerNewsEngine.Response,
		template: "web" | "news" = "web",
	): SearchTypes.EngineResult[] {
		if (!Array.isArray(data.hits)) throw new EngineError("parse", "Unexpected HN Search response");

		const results: SearchTypes.EngineResult[] = [];
		for (const hit of data.hits) {
			const title = SearchUtils.cleanText(hit.title ?? hit.story_title);
			if (!hit.objectID || !title) continue;
			const item = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;

			const [points, comments] = [hit.points ?? 0, hit.num_comments ?? 0];
			const stats = [
				`${points} point${points === 1 ? "" : "s"}`,
				`${comments} comment${comments === 1 ? "" : "s"}`,
			];
			if (hit.author) stats.push(`by ${hit.author}`);
			// Ask/Show HN bodies are HTML.
			const body = SearchUtils.excerpt(SearchUtils.stripTags(hit.story_text));

			results.push({
				url: SearchUtils.safeURL(hit.url)?.toString() ?? item,
				title,
				content: [stats.join(" · "), body].filter(Boolean).join(" — "),
				template,
				publishedAt: typeof hit.created_at_i === "number" ? hit.created_at_i * 1000 : undefined,
				author: hit.author || undefined,
				source: template === "news" ? "Hacker News" : undefined,
			});
		}
		return results;
	}
}

export namespace HackerNewsEngine {
	export interface Hit {
		objectID?: string;
		title?: string | null;
		story_title?: string | null;
		url?: string | null;
		story_text?: string | null;
		author?: string;
		points?: number | null;
		num_comments?: number | null;
		created_at_i?: number;
	}

	export interface Response {
		hits?: Hit[];
		nbHits?: number;
	}
}
