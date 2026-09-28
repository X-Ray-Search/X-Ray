import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	api_key: z
		.string()
		.min(1)
		.describe("Guardian Open Platform API key (free: https://open-platform.theguardian.com/access/)"),
	order_by: z
		.enum(["relevance", "newest"])
		.default("relevance")
		.describe("Rank articles by relevance or show the newest first"),
});

/**
 * Articles from The Guardian's Content API (content.guardianapis.com). Requires a key; free
 * developer keys allow 1 request/second and 500 per day. The old public `test` key is rejected
 * (HTTP 401). Time ranges become a `from-date` (whole days, UTC).
 */
export class GuardianEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "guardian",
		name: "The Guardian",
		description: "News articles from The Guardian's Content API — needs a free API key.",
		website: "https://open-platform.theguardian.com",
		categories: ["news"],
		settings: Settings,
		secretFields: ["api_key"],
		features: { paging: true, timeRange: true, safeSearch: false, language: false },
		requiresConfiguration: true,
		defaultRateLimitPerMinute: 10,
	});

	private static readonly PAGE_SIZE = 20;

	private static readonly TIME_RANGES: Record<SearchTypes.TimeRange, number> = {
		day: 1,
		week: 7,
		month: 30,
		year: 365,
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (!this.settings.api_key) throw new EngineError("config", "The Guardian needs an API key");

		const params = new URLSearchParams({
			q: query.query,
			"api-key": this.settings.api_key,
			"show-fields": "trailText,thumbnail,byline",
			"page-size": String(GuardianEngine.PAGE_SIZE),
			page: String(query.page),
			"order-by": this.settings.order_by,
		});
		if (query.timeRange) {
			const days = GuardianEngine.TIME_RANGES[query.timeRange];
			params.set("from-date", new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
		}

		// 400 carries a JSON error (e.g. page out of range), 401 a rejected key.
		const data = await this.http.json<GuardianEngine.Response>(
			`https://content.guardianapis.com/search?${params}`,
			{ headers: { Accept: "application/json" }, acceptStatus: [400, 401] },
		);
		if (!data.response) {
			throw data.message
				? new EngineError("config", `Guardian API: ${data.message} (check the API key)`)
				: new EngineError("parse", "Unexpected Guardian API response");
		}
		if (data.response.status !== "ok") {
			const message = data.response.message ?? "unknown error";
			if (/beyond the number of available pages/i.test(message)) return { results: [] };
			throw new EngineError("http", `Guardian API: ${message}`);
		}
		return { results: GuardianEngine.parseResults(data), totalResults: data.response.total };
	}

	static parseResults(data: GuardianEngine.Response): SearchTypes.EngineResult[] {
		const items = data.response?.results;
		if (!Array.isArray(items)) throw new EngineError("parse", "Unexpected Guardian API response");

		const results: SearchTypes.EngineResult[] = [];
		for (const item of items) {
			const url = SearchUtils.safeURL(item.webUrl)?.toString();
			if (!url || !item.webTitle) continue;
			const published = item.webPublicationDate ? Date.parse(item.webPublicationDate) : Number.NaN;
			results.push({
				url,
				title: SearchUtils.cleanText(item.webTitle),
				content: SearchUtils.stripTags(item.fields?.trailText),
				template: "news",
				publishedAt: Number.isNaN(published) ? undefined : published,
				thumbnail: SearchUtils.safeURL(item.fields?.thumbnail)?.toString(),
				author: SearchUtils.stripTags(item.fields?.byline) || undefined,
				source: "The Guardian",
			});
		}
		return results;
	}
}

export namespace GuardianEngine {
	export interface Response {
		/** Set instead of `response` when the key is rejected. */
		message?: string;
		response?: {
			status?: string;
			message?: string;
			total?: number;
			results?: Array<{
				webTitle?: string;
				webUrl?: string;
				webPublicationDate?: string;
				sectionName?: string;
				fields?: { trailText?: string; thumbnail?: string; byline?: string };
			}>;
		};
	}
}
