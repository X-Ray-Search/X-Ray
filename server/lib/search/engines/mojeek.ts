import type { HTMLElement } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/** Mojeek — an independent, privacy-focused crawler index (UK). */
export class MojeekEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "mojeek",
		name: "Mojeek",
		description: "Web results from Mojeek's independent index. Rate limits aggressively.",
		website: "https://www.mojeek.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: true, language: true },
		defaultRateLimitPerMinute: 10,
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({ q: query.query, safe: query.safesearch ? "1" : "0" });
		if (query.page > 1) params.set("s", String((query.page - 1) * 10 + 1));
		const { language } = SearchUtils.parseLocale(query.language);
		if (language) params.set("lb", language);

		const { root } = await this.http.html(`https://www.mojeek.com/search?${params}`, {
			language: query.language,
		});
		if (/captcha/i.test(root.querySelector("title")?.text ?? "")) {
			throw new EngineError("blocked", "Mojeek presented a captcha");
		}
		return { results: MojeekEngine.parseResults(root) };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll("ul.results-standard > li")) {
			const link = item.querySelector("a.title") ?? item.querySelector("h2 a");
			const url = SearchUtils.safeURL(link?.getAttribute("href"))?.toString();
			if (!link || !url) continue;
			results.push({
				url,
				title: SearchUtils.cleanText(link.text),
				content: SearchUtils.cleanText(item.querySelector("p.s")?.text),
			});
		}
		return results;
	}
}
