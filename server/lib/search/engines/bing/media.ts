import type { HTMLElement } from "node-html-parser";
import type { z } from "zod";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { BingCommon } from "./common";

const Settings = BingCommon.Settings;

export class BingImagesEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "bing_images",
		name: "Bing Images",
		description: "Image results from Microsoft Bing.",
		website: "https://www.bing.com/images",
		categories: ["images"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	private static readonly PAGE_SIZE = 35;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({
			q: query.query,
			async: "1",
			first: String((query.page - 1) * BingImagesEngine.PAGE_SIZE + 1),
			count: String(BingImagesEngine.PAGE_SIZE),
		});
		if (query.timeRange) {
			const minutes = { day: 1440, week: 10_080, month: 43_200, year: 525_600 }[query.timeRange];
			params.set("qft", `+filterui:age-lt${minutes}`);
		}

		const { root } = await this.http.html(`https://www.bing.com/images/async?${params}`, {
			language: query.language,
			cookies: BingCommon.cookies(query.safesearch, this.settings.market),
		});
		return { results: BingImagesEngine.parseResults(root) };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const anchor of root.querySelectorAll("a.iusc")) {
			let meta: { purl?: string; murl?: string; turl?: string; t?: string };
			try {
				meta = JSON.parse(anchor.getAttribute("m") ?? "");
			} catch {
				continue;
			}
			const url = SearchUtils.safeURL(meta.purl)?.toString();
			const image = SearchUtils.safeURL(meta.murl)?.toString();
			if (!url || !image) continue;

			const size = anchor.parentNode?.parentNode
				?.querySelector(".img_info .nowrap")
				?.text.match(/(\d+)\s*[×x]\s*(\d+)/);

			results.push({
				url,
				title: SearchUtils.stripTags(meta.t),
				template: "image",
				imgSrc: image,
				thumbnail: SearchUtils.safeURL(meta.turl)?.toString() ?? image,
				width: size ? Number(size[1]) : undefined,
				height: size ? Number(size[2]) : undefined,
				source: SearchUtils.hostname(url),
			});
		}
		return results;
	}
}

export class BingNewsEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "bing_news",
		name: "Bing News",
		description: "News articles from Microsoft Bing.",
		website: "https://www.bing.com/news",
		categories: ["news"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({
			q: query.query,
			InfiniteScroll: "1",
			first: String((query.page - 1) * 10 + 1),
			SFX: String(query.page - 1),
		});
		if (query.timeRange) {
			// Bing news intervals: 7 = day, 8 = week, 9 = month (no "year" filter).
			const interval = { day: "7", week: "8", month: "9", year: "" }[query.timeRange];
			if (interval) params.set("qft", `interval="${interval}"`);
		}

		const { root } = await this.http.html(`https://www.bing.com/news/infinitescrollajax?${params}`, {
			language: query.language,
			cookies: BingCommon.cookies(query.safesearch, this.settings.market),
		});
		return { results: BingNewsEngine.parseResults(root) };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const card of root.querySelectorAll(".news-card")) {
			const url = SearchUtils.safeURL(
				card.getAttribute("data-url") ?? card.getAttribute("url"),
			)?.toString();
			if (!url) continue;

			const imageSrc = card.querySelector(".image img")?.getAttribute("src");
			const thumbnail = imageSrc
				? SearchUtils.safeURL(imageSrc.replace(/&amp;/g, "&"), "https://www.bing.com")?.toString()
				: undefined;
			const age =
				card.querySelector("span[aria-label]")?.getAttribute("aria-label") ??
				card.querySelector(".ns_sc_tm")?.text;

			results.push({
				url,
				title: SearchUtils.cleanText(
					card.getAttribute("data-title") ?? card.querySelector("a.title")?.text,
				),
				content: SearchUtils.cleanText(card.querySelector(".snippet")?.text),
				template: "news",
				thumbnail,
				source: SearchUtils.cleanText(card.getAttribute("data-author")) || SearchUtils.hostname(url),
				publishedAt: SearchUtils.parseRelativeTime(age),
			});
		}
		return results;
	}
}

/** Bing video search (YouTube, Vimeo, Dailymotion, MSN, …), parsed from the result tiles. */
export class BingVideosEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "bing_videos",
		name: "Bing Videos",
		description: "Video results from Microsoft Bing.",
		website: "https://www.bing.com/videos",
		categories: ["videos"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 20,
	});

	private static readonly PAGE_SIZE = 40;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({
			q: query.query,
			first: String((query.page - 1) * BingVideosEngine.PAGE_SIZE + 1),
			count: String(BingVideosEngine.PAGE_SIZE),
			FORM: "HDRSC3",
		});
		if (query.timeRange) {
			const minutes = { day: 1440, week: 10_080, month: 43_200, year: 525_600 }[query.timeRange];
			params.set("qft", `+filterui:videoage-lt${minutes}`);
		}

		const { root } = await this.http.html(`https://www.bing.com/videos/search?${params}`, {
			language: query.language,
			cookies: BingCommon.cookies(query.safesearch, this.settings.market),
		});
		return { results: BingVideosEngine.parseResults(root) };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		const seen = new Set<string>();
		const container = root.querySelector('[data-svcptid="VideoResults"]') ?? root;
		for (const tile of container.querySelectorAll("[mmeta]")) {
			let meta: { murl?: string; pgurl?: string; turl?: string };
			try {
				meta = JSON.parse(tile.getAttribute("mmeta") ?? "");
			} catch {
				continue;
			}
			// Short-form carousels repeat videos of the main grid.
			const url = SearchUtils.safeURL(meta.murl ?? meta.pgurl)?.toString();
			if (!url || seen.has(url)) continue;
			seen.add(url);

			let details: { vt?: string; du?: string } = {};
			try {
				details = JSON.parse(tile.querySelector(".vrhdata")?.getAttribute("vrhm") ?? "{}");
			} catch {}

			const channel = tile.querySelector(".mc_vtvc_meta_row_channel");
			const publisher = channel?.parentNode?.querySelector("span");
			const image = tile.querySelector("img");
			// The tile shows "1:22"; `du` has "01:22".
			const duration = SearchUtils.cleanText(
				tile.querySelector(".mc_bc_rc.items")?.text || details.du,
			).replace(/^0(?=\d:)/, "");

			results.push({
				url,
				title: SearchUtils.cleanText(
					tile.querySelector(".mc_vtvc_title")?.getAttribute("title") || details.vt,
				),
				template: "video",
				// Lazy-loaded: `img[data-src-hq]` in the grid, `.rms_iac[data-src]` in carousels.
				thumbnail: (
					SearchUtils.safeURL(image?.getAttribute("data-src-hq")) ??
					SearchUtils.safeURL(tile.querySelector(".rms_iac")?.getAttribute("data-src")) ??
					SearchUtils.safeURL(meta.turl)
				)?.toString(),
				duration: duration || undefined,
				author: SearchUtils.cleanText(channel?.text) || undefined,
				views: SearchUtils.parseCount(tile.querySelector(".meta_vc_content")?.text),
				publishedAt: SearchUtils.parseDate(tile.querySelector(".meta_pd_content")?.text),
				source:
					(publisher !== channel && SearchUtils.cleanText(publisher?.text)) || SearchUtils.hostname(url),
				embedUrl: SearchUtils.youtubeEmbedURL(url),
			});
		}
		return results;
	}
}
