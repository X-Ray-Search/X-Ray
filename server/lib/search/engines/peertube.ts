import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	url: z
		.string()
		.regex(/^https?:\/\/\S+$/, "Use the base URL, e.g. https://sepiasearch.org")
		.default("https://sepiasearch.org")
		.describe(
			"Sepia Search (the federated PeerTube index) or any PeerTube instance — both serve `/api/v1/search/videos`",
		),
});

/**
 * PeerTube videos via Sepia Search, or via one PeerTube instance's own search (which covers the
 * videos federated to it). Both speak the same `/api/v1/search/videos` API.
 *
 * Sepia returns absolute `thumbnailUrl`/`embedUrl`; an instance returns paths it serves itself
 * (`thumbnailPath`), which are resolved against the configured URL. Embeds always use the video's
 * origin host. Language filtering is not used: most videos carry no language, and
 * `languageOneOf` drops those (about two thirds of the index).
 */
export class PeerTubeEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "peertube",
		name: "PeerTube",
		description: "Videos from the PeerTube fediverse via Sepia Search or a PeerTube instance.",
		website: "https://sepiasearch.org",
		categories: ["videos"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: false },
		defaultTimeoutMs: 5000,
	});

	private static readonly PAGE_SIZE = 20;

	private static readonly TIME_RANGES: Record<SearchTypes.TimeRange, number> = {
		day: 1,
		week: 7,
		month: 30,
		year: 365,
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const base = this.settings.url.replace(/\/+$/, "");
		const params = new URLSearchParams({
			search: query.query,
			start: String((query.page - 1) * PeerTubeEngine.PAGE_SIZE),
			count: String(PeerTubeEngine.PAGE_SIZE),
			sort: "-match",
			nsfw: query.safesearch === 0 ? "both" : "false",
		});
		if (query.timeRange) {
			const days = PeerTubeEngine.TIME_RANGES[query.timeRange];
			params.set("startDate", new Date(Date.now() - days * 86_400_000).toISOString());
		}

		const data = await this.http.json<PeerTubeEngine.Response>(
			`${base}/api/v1/search/videos?${params}`,
			{ headers: { Accept: "application/json" } },
		);
		return {
			results: PeerTubeEngine.parseResults(data, base, query.safesearch === 0),
			totalResults: data.total,
		};
	}

	/** `base` is the queried Sepia/PeerTube URL, used for relative paths. */
	static parseResults(
		data: PeerTubeEngine.Response,
		base: string,
		allowNsfw = false,
	): SearchTypes.EngineResult[] {
		if (!Array.isArray(data.data)) throw new EngineError("parse", "Unexpected PeerTube response");

		const results: SearchTypes.EngineResult[] = [];
		for (const video of data.data) {
			if (!video.name || (!allowNsfw && video.nsfw)) continue;
			const url =
				SearchUtils.safeURL(video.url, base) ??
				(video.uuid ? SearchUtils.safeURL(`/videos/watch/${video.uuid}`, base) : null);
			if (!url) continue;
			const origin = url.origin;

			const description = SearchUtils.cleanText(video.truncatedDescription ?? video.description);
			const published = Date.parse(video.publishedAt ?? "");
			const embed =
				SearchUtils.safeURL(video.embedUrl, origin) ??
				(video.uuid ? SearchUtils.safeURL(`/videos/embed/${video.uuid}`, origin) : null);

			results.push({
				url: url.toString(),
				title: SearchUtils.cleanText(video.name),
				content: SearchUtils.excerpt(description),
				template: "video",
				thumbnail: (
					SearchUtils.safeURL(video.thumbnailUrl, origin) ??
					SearchUtils.safeURL(video.thumbnailPath, base)
				)?.toString(),
				duration: video.isLive ? "LIVE" : SearchUtils.formatDuration(video.duration),
				author: video.account?.displayName || video.channel?.displayName || undefined,
				publishedAt: Number.isNaN(published) ? undefined : published,
				views: typeof video.views === "number" ? video.views : undefined,
				embedUrl: embed?.toString(),
				source: video.channel?.host ?? video.account?.host ?? url.hostname,
			});
		}
		return results;
	}
}

export namespace PeerTubeEngine {
	export interface Video {
		uuid?: string;
		name?: string;
		url?: string;
		description?: string | null;
		truncatedDescription?: string | null;
		duration?: number;
		isLive?: boolean;
		nsfw?: boolean;
		views?: number;
		publishedAt?: string;
		thumbnailUrl?: string;
		thumbnailPath?: string;
		embedUrl?: string;
		account?: { displayName?: string; host?: string };
		channel?: { displayName?: string; host?: string };
	}

	export interface Response {
		total?: number;
		data?: Video[];
	}
}
