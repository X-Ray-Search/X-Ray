import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { StartpageCommon, StartpageSerpEngine } from "./common";

/**
 * Startpage image search (Bing's image index, `UIStartpage.AppSerpImages`, blocks `images-bing`).
 * Startpage wraps images and thumbnails in its signed, expiring `/av/proxy-image` URLs; those are
 * unwrapped to the originals (X-Ray's own image proxy covers privacy). No time filter.
 */
export class StartpageImagesEngine extends StartpageSerpEngine {
	static readonly definition = SearchEngine.define({
		type: "startpage_images",
		name: "Startpage Images",
		description: "Image results (Bing) through Startpage's privacy proxy.",
		website: "https://www.startpage.com",
		categories: ["images"],
		settings: StartpageCommon.Settings,
		features: { paging: true, timeRange: false, safeSearch: true, language: true },
		defaultTimeoutMs: 6000,
		defaultRateLimitPerMinute: 6,
	});

	protected readonly startpageCategory = "pics";
	protected readonly app = "AppSerpImages";
	protected readonly supportsTimeRange = false;

	protected parse(serp: StartpageCommon.Serp) {
		return StartpageImagesEngine.parseResults(serp, this.settings.anonymous_view);
	}

	static parseResults(serp: StartpageCommon.Serp, anonymous = false): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		// `images-bing` today; `aylf-bing-images` / `query_expansions-*` are related searches.
		for (const item of StartpageCommon.items(serp, "images-")) {
			const url = StartpageCommon.resultURL(item.altClickUrl);
			const image =
				SearchUtils.safeURL(item.rawImageUrl)?.toString() ?? StartpageCommon.resultURL(item.clickUrl);
			if (!url || !image) continue;
			results.push({
				url: (anonymous && StartpageCommon.anonymousURL(item.anonAltUrl)) || url,
				title: StartpageCommon.text(item.title),
				template: "image",
				imgSrc: image,
				thumbnail: StartpageCommon.resultURL(item.thumbnailUrl) ?? image,
				width: Number(item.width) || undefined,
				height: Number(item.height) || undefined,
				source: SearchUtils.hostname(url),
			});
		}
		return results;
	}
}

/**
 * Startpage news (Bing News, `UIStartpage.AppSerpNews`, blocks `news-bing`). Dates come as a
 * relative phrase (`naturalizedDateParts`) and a day (`date`); the phrase is more precise.
 */
export class StartpageNewsEngine extends StartpageSerpEngine {
	static readonly definition = SearchEngine.define({
		type: "startpage_news",
		name: "Startpage News",
		description: "News articles (Bing News) through Startpage's privacy proxy.",
		website: "https://www.startpage.com",
		categories: ["news"],
		settings: StartpageCommon.Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 6000,
		defaultRateLimitPerMinute: 6,
	});

	protected readonly startpageCategory = "news";
	protected readonly app = "AppSerpNews";
	protected readonly supportsTimeRange = true;

	protected parse(serp: StartpageCommon.Serp) {
		return StartpageNewsEngine.parseResults(serp, this.settings.anonymous_view);
	}

	static parseResults(
		serp: StartpageCommon.Serp,
		anonymous = false,
		now = Date.now(),
	): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of StartpageCommon.items(serp, "news-")) {
			const url = StartpageCommon.resultURL(item.clickUrl);
			const title = StartpageCommon.text(item.title);
			if (!url || !title) continue;
			results.push({
				url: (anonymous && StartpageCommon.anonymousURL(item.anonViewUrl)) || url,
				title,
				content: StartpageCommon.text(item.description),
				template: "news",
				publishedAt:
					StartpageCommon.parseNaturalDate(item.naturalizedDateParts, now) ??
					StartpageCommon.parseDate(item.date),
				thumbnail: StartpageCommon.resultURL(item.thumbnailUrl),
				source: StartpageCommon.text(item.source) || SearchUtils.hostname(url),
			});
		}
		return results;
	}
}

/**
 * Startpage videos (YouTube, `UIStartpage.AppSerpVideos`, blocks `video-youtube`). YouTube-backed
 * pages are chained by the Next button's `page_token`, so page N is only available after page
 * N-1 (page 2 bootstraps from page 1). Startpage offers no date filter for videos.
 */
export class StartpageVideosEngine extends StartpageSerpEngine {
	static readonly definition = SearchEngine.define({
		type: "startpage_videos",
		name: "Startpage Videos",
		description: "Videos (YouTube) through Startpage's privacy proxy.",
		website: "https://www.startpage.com",
		categories: ["videos"],
		settings: StartpageCommon.Settings,
		features: { paging: true, timeRange: false, safeSearch: true, language: true },
		defaultTimeoutMs: 6000,
		defaultRateLimitPerMinute: 6,
	});

	protected readonly startpageCategory = "video";
	protected readonly app = "AppSerpVideos";
	protected readonly supportsTimeRange = false;
	protected override readonly tokenPaging = true;

	protected parse(serp: StartpageCommon.Serp) {
		return StartpageVideosEngine.parseResults(serp, this.settings.anonymous_view);
	}

	static parseResults(serp: StartpageCommon.Serp, anonymous = false): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of StartpageCommon.items(serp, "video-")) {
			const url = StartpageCommon.resultURL(item.clickUrl);
			const title = StartpageCommon.text(item.title);
			if (!url || !title) continue;
			results.push({
				url: (anonymous && StartpageCommon.anonymousURL(item.anonViewUrl)) || url,
				title,
				content: StartpageCommon.text(item.description),
				template: "video",
				thumbnail: StartpageCommon.resultURL(item.thumbnailUrl),
				duration: StartpageCommon.text(item.duration) || undefined,
				author: StartpageCommon.text(item.channelTitle) || undefined,
				publishedAt: StartpageCommon.parseDate(item.publishDate),
				views: Number(item.viewCount) || undefined,
				embedUrl: SearchUtils.youtubeEmbedURL(url),
				source: StartpageCommon.text(item.publisher) || SearchUtils.hostname(url),
			});
		}
		return results;
	}
}
