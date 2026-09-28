import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/**
 * Dailymotion videos via the public Data API (api.dailymotion.com, no key needed for search).
 *
 * `family_filter` follows safe search, `languages` restricts to the search language (Dailymotion
 * auto-detects it per video) and `created_after` implements time ranges. The API stops at
 * 1000 results (page × limit).
 */
export class DailymotionEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "dailymotion",
		name: "Dailymotion",
		description: "Videos from Dailymotion (public Data API).",
		website: "https://www.dailymotion.com",
		categories: ["videos"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	private static readonly PAGE_SIZE = 20;
	private static readonly MAX_RESULTS = 1000;

	private static readonly FIELDS = [
		"id",
		"title",
		"description",
		"url",
		"thumbnail_360_url",
		"duration",
		"owner.screenname",
		"created_time",
		"views_total",
		"allow_embed",
	];

	private static readonly TIME_RANGES: Record<SearchTypes.TimeRange, number> = {
		day: 86_400,
		week: 7 * 86_400,
		month: 30 * 86_400,
		year: 365 * 86_400,
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (query.page * DailymotionEngine.PAGE_SIZE > DailymotionEngine.MAX_RESULTS) {
			return { results: [] };
		}

		const params = new URLSearchParams({
			search: query.query,
			fields: DailymotionEngine.FIELDS.join(","),
			sort: "relevance",
			limit: String(DailymotionEngine.PAGE_SIZE),
			page: String(query.page),
			family_filter: query.safesearch === 0 ? "false" : "true",
			private: "false",
			password_protected: "false",
		});
		const { language } = SearchUtils.parseLocale(query.language);
		if (language) params.set("languages", language);
		if (query.timeRange) {
			const since = Math.floor(Date.now() / 1000) - DailymotionEngine.TIME_RANGES[query.timeRange];
			params.set("created_after", String(since));
		}

		const data = await this.http.json<DailymotionEngine.Response>(
			`https://api.dailymotion.com/videos?${params}`,
			{ headers: { Accept: "application/json" } },
		);
		return { results: DailymotionEngine.parseResults(data), totalResults: data.total };
	}

	static parseResults(data: DailymotionEngine.Response): SearchTypes.EngineResult[] {
		if (!Array.isArray(data.list)) throw new EngineError("parse", "Unexpected Dailymotion response");

		const results: SearchTypes.EngineResult[] = [];
		for (const video of data.list) {
			if (!video.id || !video.title) continue;
			const id = encodeURIComponent(video.id);
			const description = SearchUtils.stripTags(video.description);
			results.push({
				url: SearchUtils.safeURL(video.url)?.toString() ?? `https://www.dailymotion.com/video/${id}`,
				title: SearchUtils.cleanText(video.title),
				content: SearchUtils.excerpt(description),
				template: "video",
				thumbnail: SearchUtils.safeURL(video.thumbnail_360_url)?.toString(),
				duration: SearchUtils.formatDuration(video.duration),
				author: video["owner.screenname"] || undefined,
				publishedAt: video.created_time ? video.created_time * 1000 : undefined,
				views: typeof video.views_total === "number" ? video.views_total : undefined,
				embedUrl:
					video.allow_embed === false ? undefined : `https://www.dailymotion.com/embed/video/${id}`,
				source: "Dailymotion",
			});
		}
		return results;
	}
}

export namespace DailymotionEngine {
	export interface Video {
		id?: string;
		title?: string;
		description?: string | null;
		url?: string;
		thumbnail_360_url?: string | null;
		duration?: number;
		"owner.screenname"?: string;
		created_time?: number;
		views_total?: number;
		allow_embed?: boolean;
	}

	export interface Response {
		total?: number;
		list?: Video[];
	}
}
