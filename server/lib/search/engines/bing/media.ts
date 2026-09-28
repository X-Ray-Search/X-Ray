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
