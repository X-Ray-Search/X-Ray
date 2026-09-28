import type { HTMLElement } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../../errors";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { BraveCommon } from "./common";

const Settings = z.object({});

/** Brave Search web results (HTML). For the official, keyed API see `brave_api`. */
export class BraveEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "brave",
		name: "Brave",
		description: "Web results from Brave Search (independent index).",
		website: "https://search.brave.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		// All Brave pages share one IP budget and Brave rate-limits quickly.
		defaultRateLimitPerMinute: 15,
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({ q: query.query, source: "web" });
		if (query.page > 1) params.set("offset", String(query.page - 1));
		const tf = BraveCommon.timeFilter(query.timeRange);
		if (tf) params.set("tf", tf);

		const { root, raw } = await this.http.html(`https://search.brave.com/search?${params}`, {
			language: query.language,
			cookies: { ...BraveCommon.cookies(query), summarizer: "0" },
		});

		const results = BraveEngine.parseResults(root);
		if (!results.length && BraveCommon.isCaptcha(raw)) {
			throw new EngineError("blocked", "Brave presented a captcha");
		}
		return { results };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll('div.snippet[data-type="web"]')) {
			const link = item.querySelector("a[href]");
			const url = SearchUtils.safeURL(link?.getAttribute("href"))?.toString();
			if (!link || !url) continue;

			const content =
				item.querySelector(".generic-snippet .content") ?? item.querySelector(".snippet-description");
			const age = content?.querySelector(".t-secondary");
			const publishedAt = SearchUtils.parseRelativeTime(age?.text);
			age?.remove();

			results.push({
				url,
				title: SearchUtils.cleanText(item.querySelector(".title")?.text ?? link.text),
				content: SearchUtils.cleanText(content?.text).replace(/^-\s*/, ""),
				publishedAt,
			});
		}
		return results;
	}
}
