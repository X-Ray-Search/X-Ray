import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({
	instance_url: z
		.string()
		.regex(/^https?:\/\/\S+$/, "Use the instance base URL, e.g. https://lemmy.world")
		.default("https://lemmy.world")
		.describe("Lemmy instance to query — it searches everything federated to it"),
	search_type: z
		.enum(["Posts", "Comments", "Communities", "All"])
		.default("Posts")
		.describe("What to search for"),
	sort: z
		.enum(["TopAll", "Hot", "Active", "New", "MostComments", "Controversial", "Scaled"])
		.default("TopAll")
		.describe(
			"Result order (Lemmy has no relevance sort; `TopAll` surfaces the best matches). A time range switches to the matching `Top…` sort.",
		),
});

/**
 * Lemmy (the federated link aggregator) via an instance's `/api/v3/search` (Lemmy 0.19).
 *
 * Lemmy matches every query word anywhere in the title or body and has no relevance sort, so the
 * default `TopAll` ranks matches by score. Time ranges map to the `TopDay`…`TopYear` sorts, which
 * only consider content published in that window. Anonymous requests never get NSFW content from
 * most instances; anything flagged NSFW is dropped unless safe search is off.
 */
export class LemmyEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "lemmy",
		name: "Lemmy",
		description: "Posts, comments and communities from the Lemmy fediverse.",
		website: "https://join-lemmy.org",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: false },
		defaultTimeoutMs: 6000,
	});

	private static readonly PAGE_SIZE = 20;

	private static readonly TIME_SORTS: Record<SearchTypes.TimeRange, string> = {
		day: "TopDay",
		week: "TopWeek",
		month: "TopMonth",
		year: "TopYear",
	};

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const instance = this.settings.instance_url.replace(/\/+$/, "");
		const params = new URLSearchParams({
			q: query.query,
			type_: this.settings.search_type,
			sort: query.timeRange ? LemmyEngine.TIME_SORTS[query.timeRange] : this.settings.sort,
			listing_type: "All",
			page: String(query.page),
			limit: String(LemmyEngine.PAGE_SIZE),
		});

		const data = await this.http.json<LemmyEngine.Response>(`${instance}/api/v3/search?${params}`, {
			headers: { Accept: "application/json" },
		});
		return { results: LemmyEngine.parseResults(data, instance, query.safesearch === 0) };
	}

	static parseResults(
		data: LemmyEngine.Response,
		instance: string,
		allowNsfw = false,
	): SearchTypes.EngineResult[] {
		if (![data.posts, data.comments, data.communities].some(Array.isArray)) {
			throw new EngineError("parse", "Unexpected Lemmy search response");
		}

		const results: SearchTypes.EngineResult[] = [];
		for (const { post, creator, community, counts } of data.posts ?? []) {
			if (!post?.name || (!allowNsfw && (post.nsfw || community?.nsfw))) continue;
			const discussion = SearchUtils.safeURL(post.ap_id)?.toString() ?? `${instance}/post/${post.id}`;
			// Link posts point at the article; image/video uploads are better shown as the discussion.
			const link = SearchUtils.safeURL(post.url)?.toString();
			const media = link && /\/pictrs\/|\.(jpe?g|png|gif|webp|avif|mp4|webm)(\?|$)/i.test(link);
			const stats = counts ? `${counts.score ?? 0} points · ${counts.comments ?? 0} comments` : "";
			results.push({
				url: link && !media ? link : discussion,
				title: SearchUtils.cleanText(post.name),
				content: LemmyEngine.markdownToText(post.body) || stats,
				publishedAt: LemmyEngine.date(post.published),
				author: creator?.display_name || creator?.name || undefined,
				source: LemmyEngine.communityHandle(community),
				thumbnail: SearchUtils.safeURL(post.thumbnail_url)?.toString(),
			});
		}

		for (const { community, counts } of data.communities ?? []) {
			const url = SearchUtils.safeURL(community?.actor_id)?.toString();
			if (!community || !url || (!allowNsfw && community.nsfw)) continue;
			results.push({
				url,
				title: SearchUtils.cleanText(community.title || community.name),
				content:
					LemmyEngine.markdownToText(community.description) ||
					(counts?.subscribers !== undefined ? `${counts.subscribers} subscribers` : ""),
				source: LemmyEngine.communityHandle(community),
				thumbnail: SearchUtils.safeURL(community.icon)?.toString(),
			});
		}

		for (const { comment, creator, post, community } of data.comments ?? []) {
			if (!comment?.content || (!allowNsfw && (post?.nsfw || community?.nsfw))) continue;
			const url =
				SearchUtils.safeURL(comment.ap_id)?.toString() ?? `${instance}/comment/${comment.id}`;
			results.push({
				url,
				title: `Comment on “${SearchUtils.cleanText(post?.name) || "a post"}”`,
				content: LemmyEngine.markdownToText(comment.content),
				publishedAt: LemmyEngine.date(comment.published),
				author: creator?.display_name || creator?.name || undefined,
				source: LemmyEngine.communityHandle(community),
			});
		}
		return results;
	}

	/** `c/name@host`, the federated community name. */
	private static communityHandle(community: LemmyEngine.Community | undefined) {
		if (!community?.name) return undefined;
		const host = SearchUtils.safeURL(community.actor_id)?.hostname;
		return host ? `c/${community.name}@${host}` : `c/${community.name}`;
	}

	private static date(value: string | undefined): number | undefined {
		const time = value ? Date.parse(value) : Number.NaN;
		return Number.isNaN(time) ? undefined : time;
	}

	/** Rough Markdown → plain-text excerpt for post bodies and descriptions. */
	static markdownToText(markdown: string | undefined | null, max = 300): string {
		if (!markdown) return "";
		const text = SearchUtils.cleanText(
			markdown
				.replace(/```[\s\S]*?```/g, " ")
				.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
				.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
				.replace(/^\s*(:::.*|[-*_]{3,})\s*$/gm, " ")
				.replace(/^\s*((>\s?)+|#{1,6}\s+|[-*+]\s+|\d+\.\s+)/gm, "")
				.replace(/\*\*|__|~~|`/g, ""),
		);
		return SearchUtils.excerpt(text, max);
	}
}

export namespace LemmyEngine {
	export interface Community {
		id?: number;
		name?: string;
		title?: string;
		description?: string | null;
		actor_id?: string;
		icon?: string | null;
		nsfw?: boolean;
	}

	export interface Creator {
		name?: string;
		display_name?: string | null;
	}

	export interface Response {
		posts?: Array<{
			post?: {
				id?: number;
				name?: string;
				url?: string | null;
				body?: string | null;
				ap_id?: string;
				published?: string;
				nsfw?: boolean;
				thumbnail_url?: string | null;
			};
			creator?: Creator;
			community?: Community;
			counts?: { score?: number; comments?: number };
		}>;
		comments?: Array<{
			comment?: { id?: number; content?: string; ap_id?: string; published?: string };
			creator?: Creator;
			post?: { name?: string; nsfw?: boolean };
			community?: Community;
		}>;
		communities?: Array<{ community?: Community; counts?: { subscribers?: number } }>;
	}
}
