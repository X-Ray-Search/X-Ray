import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	privacy_embeds: z
		.boolean()
		.default(true)
		.describe("Use youtube-nocookie.com for embedded players"),
});

/** YouTube video search, parsed from the page's `ytInitialData` (first page only). */
export class YouTubeEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "youtube",
		name: "YouTube",
		description: "Videos from YouTube (first results page).",
		website: "https://www.youtube.com",
		categories: ["videos"],
		settings: Settings,
		features: { paging: false, timeRange: true, safeSearch: false, language: true },
	});

	/** `sp` filter values for "upload date". */
	private static readonly TIME_FILTERS: Record<SearchTypes.TimeRange, string> = {
		day: "EgIIAg==",
		week: "EgIIAw==",
		month: "EgIIBA==",
		year: "EgIIBQ==",
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (query.page > 1) return { results: [] };

		const params = new URLSearchParams({ search_query: query.query });
		const { language, region } = SearchUtils.parseLocale(query.language);
		if (language) params.set("hl", language);
		if (region) params.set("gl", region);
		if (query.timeRange) params.set("sp", YouTubeEngine.TIME_FILTERS[query.timeRange]);

		const html = await this.http.text(`https://www.youtube.com/results?${params}`, {
			language: query.language,
			// Skip the EU consent interstitial.
			cookies: { CONSENT: "YES+", SOCS: "CAI" },
		});
		return { results: this.parse(html) };
	}

	parse(html: string): SearchTypes.EngineResult[] {
		const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
		if (!match) throw new EngineError("parse", "ytInitialData not found");

		let data: any;
		try {
			data = JSON.parse(match[1]!);
		} catch {
			throw new EngineError("parse", "ytInitialData is not valid JSON");
		}

		const sections: any[] =
			data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
		const embedHost = this.settings.privacy_embeds ? "www.youtube-nocookie.com" : "www.youtube.com";

		const results: SearchTypes.EngineResult[] = [];
		for (const item of sections.flatMap((s) => s.itemSectionRenderer?.contents ?? [])) {
			const video = item.videoRenderer;
			if (!video?.videoId) continue;
			const snippet =
				video.detailedMetadataSnippets?.[0]?.snippetText?.runs ?? video.descriptionSnippet?.runs ?? [];
			results.push({
				url: `https://www.youtube.com/watch?v=${video.videoId}`,
				title: SearchUtils.cleanText(video.title?.runs?.map((r: any) => r.text).join("")),
				content: SearchUtils.cleanText(snippet.map((r: any) => r.text).join("")),
				template: "video",
				thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
				duration: video.lengthText?.simpleText,
				author: video.ownerText?.runs?.[0]?.text,
				publishedAt: SearchUtils.parseRelativeTime(video.publishedTimeText?.simpleText),
				views: SearchUtils.parseCount(video.viewCountText?.simpleText),
				embedUrl: `https://${embedHost}/embed/${video.videoId}`,
				source: "YouTube",
			});
		}
		return results;
	}
}
