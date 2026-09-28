import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { StartpageCommon, StartpageSerpEngine } from "./common";

/**
 * Startpage web results — Google's index, fetched anonymously by Startpage. Results are read from
 * the SERP props embedded in the page (`UIStartpage.AppSerpWeb`, blocks `web-google`). Search is
 * gated by an Anubis proof-of-work challenge (solved automatically, see `StartpageAnubis`), and
 * Startpage suspends IPs that scrape, so keep the request budget low.
 */
export class StartpageEngine extends StartpageSerpEngine {
	static readonly definition = SearchEngine.define({
		type: "startpage",
		name: "Startpage",
		description: "Google web results through Startpage's privacy proxy.",
		website: "https://www.startpage.com",
		categories: ["general"],
		settings: StartpageCommon.Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
		defaultTimeoutMs: 6000,
		defaultRateLimitPerMinute: 12,
	});

	/** Google's date prefix of a snippet: `27 Feb 2019 ... `, `Feb 27, 2019 ... `, `3 days ago ... `. */
	private static readonly DATE_PREFIX =
		/^(\d{1,2} [A-Z][a-z]{2,4}\.? \d{4}|[A-Z][a-z]{2,4}\.? \d{1,2}, \d{4}|\d+ (?:second|minute|hour|day|week|month|year)s? ago) \.\.\. ?/;

	protected readonly startpageCategory = "web";
	protected readonly app = "AppSerpWeb";
	protected readonly supportsTimeRange = true;

	protected parse(serp: StartpageCommon.Serp) {
		return StartpageEngine.parseResults(serp, this.settings.anonymous_view);
	}

	static parseResults(serp: StartpageCommon.Serp, anonymous = false): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of StartpageCommon.items(serp, "web-")) {
			const url = StartpageCommon.resultURL(item.clickUrl);
			const title = StartpageCommon.text(item.title);
			if (!url || !title) continue;

			let content = StartpageCommon.text(item.description);
			let publishedAt: number | undefined;
			const date = content.match(StartpageEngine.DATE_PREFIX);
			if (date) {
				const phrase = date[1] ?? "";
				publishedAt = phrase.endsWith("ago")
					? SearchUtils.parseRelativeTime(phrase)
					: StartpageCommon.parseDate(phrase);
				content = content.slice(date[0].length);
			}

			results.push({
				url: (anonymous && StartpageCommon.anonymousURL(item.anonViewUrl)) || url,
				title,
				content,
				publishedAt,
			});
		}
		return results;
	}
}
