import { z } from "zod";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	api_key: z.string().min(1).describe("Brave Search API subscription token"),
});

/** The official Brave Search API (https://api-dashboard.search.brave.com). Requires a key. */
export class BraveAPIEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "brave_api",
		name: "Brave Search API",
		description: "Official Brave Search API — reliable, no scraping, needs an API key.",
		website: "https://brave.com/search/api/",
		categories: ["general", "images", "news", "videos"],
		settings: Settings,
		secretFields: ["api_key"],
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		requiresConfiguration: true,
	});

	private static readonly ENDPOINTS: Record<SearchTypes.Category, string> = {
		general: "web/search",
		images: "images/search",
		news: "news/search",
		videos: "videos/search",
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const count = query.category === "images" ? 50 : 20;
		const params = new URLSearchParams({
			q: query.query,
			count: String(count),
			safesearch: query.category === "images" && query.safesearch === 1 ? "strict" : ["off", "moderate", "strict"][query.safesearch]!,
		});
		if (query.category !== "images") params.set("offset", String(Math.min(query.page - 1, 9)));
		if (query.timeRange && query.category !== "images") {
			params.set("freshness", { day: "pd", week: "pw", month: "pm", year: "py" }[query.timeRange]);
		}
		const { language, region } = SearchUtils.parseLocale(query.language);
		if (language) {
			params.set("search_lang", language);
			params.set("country", (region ?? SearchUtils.defaultRegion(language)).toLowerCase());
		}

		const data = await this.http.json<any>(
			`https://api.search.brave.com/res/v1/${BraveAPIEngine.ENDPOINTS[query.category]}?${params}`,
			{ headers: { "X-Subscription-Token": this.settings.api_key, Accept: "application/json" } },
		);

		const items: any[] = query.category === "general" ? (data.web?.results ?? []) : (data.results ?? []);
		const results: SearchTypes.EngineResult[] = [];
		for (const item of items) {
			const url = SearchUtils.safeURL(item.url)?.toString();
			if (!url) continue;
			const published = item.page_age ? Date.parse(item.page_age) : Number.NaN;
			const base = {
				url,
				title: SearchUtils.stripTags(item.title),
				content: SearchUtils.stripTags(item.description),
				publishedAt: Number.isNaN(published) ? SearchUtils.parseRelativeTime(item.age) : published,
				thumbnail: SearchUtils.safeURL(item.thumbnail?.src)?.toString(),
				source: item.meta_url?.hostname ?? item.profile?.name ?? SearchUtils.hostname(url),
			};
			if (query.category === "images") {
				results.push({
					...base,
					template: "image",
					imgSrc: SearchUtils.safeURL(item.properties?.url)?.toString() ?? base.thumbnail,
					width: item.properties?.width,
					height: item.properties?.height,
				});
			} else if (query.category === "videos") {
				results.push({
					...base,
					template: "video",
					duration: item.video?.duration,
					author: item.video?.creator,
					views: item.video?.views,
				});
			} else {
				results.push({ ...base, template: query.category === "news" ? "news" : "web" });
			}
		}

		const corrections = data.query?.altered ? [data.query.altered as string] : [];
		return { results, corrections };
	}
}
