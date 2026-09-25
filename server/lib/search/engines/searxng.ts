import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	url: z
		.string()
		.regex(/^https?:\/\/\S+$/, "Use the instance base URL, e.g. https://searx.example.org")
		.describe("Base URL of the SearXNG instance (JSON output must be enabled)"),
	engines: z.string().max(512).default("").describe("Comma separated upstream engines (optional)"),
	auth_header: z
		.string()
		.max(1024)
		.default("")
		.describe("Optional `Authorization` header value, e.g. for an X-Ray instance: `Bearer xray_apikey_…`"),
});

/**
 * Uses another SearXNG (or X-Ray, via its SearXNG API) instance as a backend.
 */
export class SearXNGEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "searxng",
		name: "SearXNG",
		description: "Results from an upstream SearXNG or X-Ray instance via its JSON API.",
		website: "https://docs.searxng.org",
		categories: ["general", "images", "news", "videos"],
		settings: Settings,
		secretFields: ["auth_header"],
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		requiresConfiguration: true,
		defaultTimeoutMs: 6000,
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({
			q: query.query,
			format: "json",
			categories: query.category,
			pageno: String(query.page),
			safesearch: String(query.safesearch),
			language: query.language,
		});
		if (query.timeRange) params.set("time_range", query.timeRange);
		if (this.settings.engines) params.set("engines", this.settings.engines);

		const data = await this.http.json<SearXNGEngine.Response>(
			`${this.settings.url.replace(/\/+$/, "")}/search?${params}`,
			{
				language: query.language,
				headers: this.settings.auth_header ? { Authorization: this.settings.auth_header } : {},
			},
		);
		if (!Array.isArray(data.results)) {
			throw new EngineError("parse", "Upstream did not return SearXNG JSON");
		}

		const template = ({ images: "image", videos: "video", news: "news", general: "web" } as const)[
			query.category
		];
		const results: SearchTypes.EngineResult[] = [];
		for (const item of data.results) {
			const url = SearchUtils.safeURL(item.url)?.toString();
			if (!url) continue;
			const published = item.publishedDate ? Date.parse(item.publishedDate) : Number.NaN;
			results.push({
				url,
				title: SearchUtils.cleanText(item.title),
				content: SearchUtils.cleanText(item.content),
				template,
				publishedAt: Number.isNaN(published) ? undefined : published,
				imgSrc: SearchUtils.safeURL(item.img_src)?.toString(),
				thumbnail: SearchUtils.safeURL(item.thumbnail_src ?? item.thumbnail)?.toString(),
				author: item.author || undefined,
				duration: typeof item.length === "string" ? item.length : undefined,
				embedUrl: SearchUtils.safeURL(item.iframe_src)?.toString(),
				source: item.source || undefined,
			});
		}

		return {
			results,
			suggestions: data.suggestions ?? [],
			corrections: data.corrections ?? [],
			totalResults: data.number_of_results || undefined,
		};
	}
}

export namespace SearXNGEngine {
	export interface Response {
		results?: any[];
		suggestions?: string[];
		corrections?: string[];
		number_of_results?: number;
	}
}
