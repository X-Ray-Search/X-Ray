import { z } from "zod";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { DuckDuckGoCommon } from "./common";

const Settings = z.object({
	region: z
		.string()
		.default("auto")
		.describe("Force a DuckDuckGo region (`kl`), e.g. `de-de`. `auto` derives it from the language."),
});
type Settings = z.infer<typeof Settings>;

/** Shared request logic of DuckDuckGo's JSON endpoints (`i.js`, `news.js`, `v.js`). */
abstract class DuckDuckGoJSONEngine extends SearchEngine<Settings> {
	protected abstract readonly endpoint: string;
	protected abstract readonly pageSize: number;
	protected abstract filters(query: SearchTypes.EngineQuery): Record<string, string>;
	protected abstract mapResult(item: any): SearchTypes.EngineResult | null;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const region = DuckDuckGoCommon.region(query.language, this.settings.region);
		const vqd = await DuckDuckGoCommon.getVQD(this.http, query.query, region);
		const params = new URLSearchParams({
			l: region,
			o: "json",
			q: query.query,
			vqd,
			p: query.safesearch === 0 ? "-1" : "1",
			s: String((query.page - 1) * this.pageSize),
			...this.filters(query),
		});

		const data = await this.http.json<{ results?: any[] }>(
			`https://duckduckgo.com/${this.endpoint}?${params}`,
			{
				language: query.language,
				headers: DuckDuckGoCommon.JSON_HEADERS,
				cookies: { kl: region, kp: DuckDuckGoCommon.safeSearch(query.safesearch) },
			},
		);

		const results: SearchTypes.EngineResult[] = [];
		for (const item of data.results ?? []) {
			const mapped = this.mapResult(item);
			if (mapped) results.push(mapped);
		}
		return { results };
	}
}

export class DuckDuckGoImagesEngine extends DuckDuckGoJSONEngine {
	static readonly definition = SearchEngine.define({
		type: "duckduckgo_images",
		name: "DuckDuckGo Images",
		description: "Image results from DuckDuckGo.",
		website: "https://duckduckgo.com/?ia=images",
		categories: ["images"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	protected readonly endpoint = "i.js";
	protected readonly pageSize = 100;

	protected filters(query: SearchTypes.EngineQuery) {
		const time = query.timeRange
			? `time:${{ day: "Day", week: "Week", month: "Month", year: "Year" }[query.timeRange]}`
			: "";
		return { f: `${time},,,,,` };
	}

	protected mapResult(item: any): SearchTypes.EngineResult | null {
		const url = SearchUtils.safeURL(item.url)?.toString();
		const image = SearchUtils.safeURL(item.image)?.toString();
		if (!url || !image) return null;
		return {
			url,
			title: SearchUtils.cleanText(item.title),
			template: "image",
			imgSrc: image,
			thumbnail: SearchUtils.safeURL(item.thumbnail)?.toString() ?? image,
			width: Number(item.width) || undefined,
			height: Number(item.height) || undefined,
			source: SearchUtils.hostname(url),
		};
	}
}

export class DuckDuckGoNewsEngine extends DuckDuckGoJSONEngine {
	static readonly definition = SearchEngine.define({
		type: "duckduckgo_news",
		name: "DuckDuckGo News",
		description: "News articles from DuckDuckGo.",
		website: "https://duckduckgo.com/?ia=news",
		categories: ["news"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	protected readonly endpoint = "news.js";
	protected readonly pageSize = 30;

	protected filters(query: SearchTypes.EngineQuery): Record<string, string> {
		const df = DuckDuckGoCommon.timeRange(query.timeRange);
		return df ? { df } : {};
	}

	protected mapResult(item: any): SearchTypes.EngineResult | null {
		const url = SearchUtils.safeURL(item.url)?.toString();
		if (!url) return null;
		return {
			url,
			title: SearchUtils.stripTags(item.title),
			content: SearchUtils.stripTags(item.excerpt),
			template: "news",
			publishedAt: typeof item.date === "number" ? item.date * 1000 : undefined,
			thumbnail: SearchUtils.safeURL(item.image)?.toString(),
			source: SearchUtils.cleanText(item.source) || SearchUtils.hostname(url),
		};
	}
}

export class DuckDuckGoVideosEngine extends DuckDuckGoJSONEngine {
	static readonly definition = SearchEngine.define({
		type: "duckduckgo_videos",
		name: "DuckDuckGo Videos",
		description: "Video results from DuckDuckGo (YouTube, Vimeo, Dailymotion, …).",
		website: "https://duckduckgo.com/?ia=videos",
		categories: ["videos"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	protected readonly endpoint = "v.js";
	protected readonly pageSize = 60;

	protected filters(query: SearchTypes.EngineQuery) {
		const time = query.timeRange ? `publishedAfter:${DuckDuckGoCommon.timeRange(query.timeRange)}` : "";
		return { f: `${time},,,` };
	}

	protected mapResult(item: any): SearchTypes.EngineResult | null {
		const url = SearchUtils.safeURL(item.content)?.toString();
		if (!url) return null;
		const published = item.published ? Date.parse(item.published) : Number.NaN;
		return {
			url,
			title: SearchUtils.cleanText(item.title),
			content: SearchUtils.cleanText(item.description),
			template: "video",
			publishedAt: Number.isNaN(published) ? undefined : published,
			thumbnail:
				SearchUtils.safeURL(item.images?.large ?? item.images?.medium ?? item.images?.small)?.toString(),
			duration: SearchUtils.cleanText(item.duration) || undefined,
			author: SearchUtils.cleanText(item.uploader) || undefined,
			source: SearchUtils.cleanText(item.publisher) || SearchUtils.hostname(url),
			embedUrl: SearchUtils.safeURL(item.embed_url)?.toString(),
			views: typeof item.statistics?.viewCount === "number" ? item.statistics.viewCount : undefined,
		};
	}
}
