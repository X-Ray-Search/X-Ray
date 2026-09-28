import { z } from "zod";
import { EngineError } from "../../errors";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { BraveCommon } from "./common";

const Settings = z.object({});
type Settings = z.infer<typeof Settings>;

/**
 * Shared request logic of Brave's images/videos/news pages. Their results are read from the
 * search response SvelteKit embeds for hydration — the same data the page renders from. Paging
 * (`offset`) and the time filter (`tf`) are only sent when the definition's `features` say the
 * page honours them.
 */
abstract class BraveMediaEngine extends SearchEngine<Settings> {
	/** Path under `search.brave.com`. */
	protected abstract readonly path: string;

	protected abstract parse(response: Record<string, any>): SearchTypes.EngineResult[];

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const { features } = (this.constructor as SearchEngine.Class).definition;
		if (query.page > 1 && !features.paging) return { results: [] };

		const params = new URLSearchParams({ q: query.query });
		if (query.page > 1) params.set("offset", String(query.page - 1));
		const tf = features.timeRange ? BraveCommon.timeFilter(query.timeRange) : null;
		if (tf) params.set("tf", tf);

		const raw = await this.http.text(`https://search.brave.com/${this.path}?${params}`, {
			language: query.language,
			cookies: BraveCommon.cookies(query),
		});
		const response = BraveCommon.searchResponse(raw);
		if (!response) {
			if (/captcha/i.test(raw)) throw new EngineError("blocked", "Brave presented a captcha");
			throw new EngineError("parse", `Brave ${this.path} page data not found`);
		}
		return { results: this.parse(response) };
	}
}

/** Brave Search images (first page only — Brave returns all ~200 images at once). */
export class BraveImagesEngine extends BraveMediaEngine {
	static readonly definition = SearchEngine.define({
		type: "brave_images",
		name: "Brave Images",
		description: "Image results from Brave Search.",
		website: "https://search.brave.com/images",
		categories: ["images"],
		settings: Settings,
		features: { paging: false, timeRange: false, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 10,
	});

	protected readonly path = "images";

	protected parse(response: Record<string, any>) {
		return BraveImagesEngine.parseResults(response);
	}

	static parseResults(response: Record<string, any>): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of Array.isArray(response.results) ? response.results : []) {
			const url = SearchUtils.safeURL(item?.url)?.toString();
			const image = SearchUtils.safeURL(
				item?.properties?.url ?? item?.thumbnail?.original,
			)?.toString();
			if (!url || !image) continue;
			results.push({
				url,
				title: SearchUtils.cleanText(item.title) || SearchUtils.hostname(url),
				template: "image",
				imgSrc: image,
				thumbnail: SearchUtils.safeURL(item.thumbnail?.src)?.toString() ?? image,
				width: Number(item.properties?.width) || undefined,
				height: Number(item.properties?.height) || undefined,
				source: SearchUtils.hostname(url),
			});
		}
		return results;
	}
}

/** Brave Search news (first page only — `offset` returns an empty page; ~30–50 articles). */
export class BraveNewsEngine extends BraveMediaEngine {
	static readonly definition = SearchEngine.define({
		type: "brave_news",
		name: "Brave News",
		description: "News articles from Brave Search.",
		website: "https://search.brave.com/news",
		categories: ["news"],
		settings: Settings,
		features: { paging: false, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 10,
	});

	protected readonly path = "news";

	protected parse(response: Record<string, any>) {
		return BraveNewsEngine.parseResults(response);
	}

	static parseResults(response: Record<string, any>): SearchTypes.EngineResult[] {
		const items = response.news?.results ?? response.results;
		const results: SearchTypes.EngineResult[] = [];
		for (const item of Array.isArray(items) ? items : []) {
			const url = SearchUtils.safeURL(item?.url)?.toString();
			if (!url) continue;
			results.push({
				url,
				title: SearchUtils.cleanText(item.title),
				content: SearchUtils.stripTags(item.description),
				template: "news",
				publishedAt: SearchUtils.parseDate(item.page_age) ?? SearchUtils.parseDate(item.age),
				thumbnail: SearchUtils.safeURL(item.thumbnail?.src)?.toString(),
				source:
					SearchUtils.cleanText(item.profile?.name ?? item.meta_url?.hostname) ||
					SearchUtils.hostname(url),
			});
		}
		return results;
	}
}

/** Brave Search videos (YouTube, Vimeo, Dailymotion, …). */
export class BraveVideosEngine extends BraveMediaEngine {
	static readonly definition = SearchEngine.define({
		type: "brave_videos",
		name: "Brave Videos",
		description: "Video results from Brave Search.",
		website: "https://search.brave.com/videos",
		categories: ["videos"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 10,
	});

	protected readonly path = "videos";

	protected parse(response: Record<string, any>) {
		return BraveVideosEngine.parseResults(response);
	}

	static parseResults(response: Record<string, any>): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of Array.isArray(response.results) ? response.results : []) {
			const url = SearchUtils.safeURL(item?.url)?.toString();
			if (!url) continue;
			const video = item.video ?? {};
			const publisher = SearchUtils.cleanText(video.publisher);
			// Titles carry the site as a suffix: "The Linux Kernel … - YouTube".
			const title = SearchUtils.cleanText(item.title);
			const duration = SearchUtils.cleanText(video.duration).replace(/^0(?=\d:)/, "");
			const views =
				typeof video.views === "number" ? video.views : SearchUtils.parseCount(video.views);

			results.push({
				url,
				title:
					publisher && title.endsWith(` - ${publisher}`) ? title.slice(0, -publisher.length - 3) : title,
				content: SearchUtils.stripTags(item.description),
				template: "video",
				publishedAt: SearchUtils.parseDate(item.page_age) ?? SearchUtils.parseDate(item.age),
				thumbnail: SearchUtils.safeURL(item.thumbnail?.src ?? item.thumbnail?.original)?.toString(),
				duration: duration || undefined,
				author: SearchUtils.cleanText(video.creator ?? video.author?.name) || undefined,
				views,
				source: publisher || SearchUtils.hostname(url),
				embedUrl: SearchUtils.youtubeEmbedURL(url),
			});
		}
		return results;
	}
}
