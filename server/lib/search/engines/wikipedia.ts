import { z } from "zod";
import { AppConstants } from "../../utils/constants";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	language: z
		.string()
		.regex(/^(auto|[a-z-]{2,12})$/)
		.default("auto")
		.describe("Wikipedia language edition (`en`, `de`, …). `auto` follows the search language."),
});

/** Wikipedia full-text search via the MediaWiki API. */
export class WikipediaEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "wikipedia",
		name: "Wikipedia",
		description: "Articles from Wikipedia (MediaWiki search API).",
		website: "https://www.wikipedia.org",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: false, language: true },
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const lang =
			this.settings.language !== "auto"
				? this.settings.language
				: (SearchUtils.parseLocale(query.language).language ?? "en");
		const params = new URLSearchParams({
			action: "query",
			list: "search",
			srsearch: query.query,
			format: "json",
			srlimit: "10",
			sroffset: String((query.page - 1) * 10),
			srprop: "snippet",
			utf8: "1",
		});

		const data = await this.http.json<{
			query?: {
				search?: Array<{ title: string; snippet: string }>;
				searchinfo?: { totalhits?: number };
			};
		}>(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
			headers: { "User-Agent": AppConstants.BOT_USER_AGENT },
		});

		const results = (data.query?.search ?? []).map((item) => ({
			url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
			title: item.title,
			content: SearchUtils.stripTags(item.snippet),
		}));
		return { results, totalResults: data.query?.searchinfo?.totalhits };
	}
}
