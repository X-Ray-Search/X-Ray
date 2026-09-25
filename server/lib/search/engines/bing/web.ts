import type { HTMLElement } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../../errors";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { BingCommon } from "./common";

const Settings = z.object({});

export class BingEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "bing",
		name: "Bing",
		description: "Web results from Microsoft Bing.",
		website: "https://www.bing.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({ q: query.query, pq: query.query });
		if (query.page > 1) {
			params.set("first", String((query.page - 1) * 10 + 1));
			params.set("FORM", query.page === 2 ? "PERE" : `PERE${query.page - 2}`);
		}
		const filter = BingCommon.timeFilter(query.timeRange);
		if (filter) params.set("filters", filter);

		const { root, raw } = await this.http.html(`https://www.bing.com/search?${params}`, {
			language: query.language,
			cookies: BingCommon.cookies(query.language, query.safesearch),
		});

		const results = BingEngine.parseResults(root);
		if (!results.length && /id="b_captcha|captcha/i.test(raw) && !root.querySelector("li.b_no")) {
			throw new EngineError("blocked", "Bing presented a captcha");
		}

		const count = root.querySelector(".sb_count")?.text.replace(/[^\d]/g, "");
		return { results, totalResults: count ? Number(count) : undefined };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll("li.b_algo")) {
			const link = item.querySelector("h2 a");
			const url = BingCommon.resolveLink(link?.getAttribute("href"));
			if (!link || !url) continue;

			const snippet = item.querySelector(".b_caption p") ?? item.querySelector("p");
			let publishedText: string | undefined;
			if (snippet) {
				const date = snippet.querySelector(".news_dt");
				publishedText = date?.text;
				date?.remove();
				snippet.querySelector(".b_algoReadMore")?.remove();
			}

			results.push({
				url,
				title: SearchUtils.cleanText(link.text),
				content: SearchUtils.cleanText(snippet?.text).replace(/^[·\s]+/, ""),
				publishedAt: SearchUtils.parseRelativeTime(publishedText),
			});
		}
		return results;
	}
}
