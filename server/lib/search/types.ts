import { z } from "zod";

/**
 * Core search vocabulary shared by engines, the aggregator, the API models and the
 * SearXNG compatibility layer.
 */
export namespace SearchTypes {
	export const Categories = ["general", "images", "news", "videos"] as const;
	export const Category = z.enum(Categories);
	export type Category = z.infer<typeof Category>;

	export const TimeRanges = ["day", "week", "month", "year"] as const;
	export const TimeRange = z.enum(TimeRanges);
	export type TimeRange = z.infer<typeof TimeRange>;

	/** 0 = off, 1 = moderate, 2 = strict (same scale as SearXNG). */
	export const SafeSearch = z.union([z.literal(0), z.literal(1), z.literal(2)]);
	export type SafeSearch = z.infer<typeof SafeSearch>;

	/** How a result is meant to be rendered. */
	export const Templates = ["web", "image", "video", "news"] as const;
	export const Template = z.enum(Templates);
	export type Template = z.infer<typeof Template>;

	export const CategoryInfo: Record<Category, { name: string; icon: string; template: Template }> = {
		general: { name: "General", icon: "i-lucide-search", template: "web" },
		images: { name: "Images", icon: "i-lucide-image", template: "image" },
		news: { name: "News", icon: "i-lucide-newspaper", template: "news" },
		videos: { name: "Videos", icon: "i-lucide-play-circle", template: "video" },
	};

	/** The normalized query every engine receives. */
	export interface EngineQuery {
		readonly query: string;
		readonly category: Category;
		/** 1-based page number. */
		readonly page: number;
		/** BCP-47-ish locale (`en-US`, `de`) or `all`. */
		readonly language: string;
		readonly safesearch: SafeSearch;
		readonly timeRange: TimeRange | null;
	}

	/** A single result as returned by one engine, before merging. */
	export interface EngineResult {
		url: string;
		title: string;
		content?: string;
		template?: Template;
		/** Unix epoch milliseconds. */
		publishedAt?: number;
		thumbnail?: string;
		imgSrc?: string;
		width?: number;
		height?: number;
		/** Publisher / site name shown next to the result. */
		source?: string;
		author?: string;
		/** Human readable duration, e.g. `12:34`. */
		duration?: string;
		embedUrl?: string;
		views?: number;
	}

	export interface EngineResponse {
		results: EngineResult[];
		suggestions?: string[];
		corrections?: string[];
		totalResults?: number;
	}
}

/**
 * Zod schemas of the aggregated search response. Used by the v1 API (OpenAPI + client
 * generation) and as the source of truth for the SearXNG mapping.
 */
export namespace SearchModels {
	export const Result = z.object({
		url: z.string(),
		title: z.string(),
		content: z.string(),
		template: SearchTypes.Template,
		category: SearchTypes.Category,
		engines: z.array(z.string()).describe("Slugs of the engines that returned this result"),
		positions: z.array(z.number()),
		score: z.number(),
		published_at: z.number().nullable(),
		thumbnail: z.string().nullable(),
		img_src: z.string().nullable(),
		width: z.number().nullable(),
		height: z.number().nullable(),
		source: z.string().nullable(),
		author: z.string().nullable(),
		duration: z.string().nullable(),
		embed_url: z.string().nullable(),
		views: z.number().nullable(),
	});
	export type Result = z.infer<typeof Result>;

	export const EngineStatus = z.object({
		slug: z.string(),
		name: z.string(),
		status: z.enum(["ok", "error", "timeout", "blocked", "suspended"]),
		time_ms: z.number(),
		results: z.number(),
		error: z.string().nullable(),
	});
	export type EngineStatus = z.infer<typeof EngineStatus>;

	export const InstantAnswer = z.object({
		provider: z.string().describe("Id of the instant answer provider"),
		type: z.string().describe("Rendering type, e.g. `calculator`, `weather`, `wikipedia`"),
		placement: z.enum(["top", "side"]),
		title: z.string(),
		text: z.string().describe("Plain-text fallback of the answer"),
		data: z.record(z.string(), z.any()),
		source: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
	});
	export type InstantAnswer = z.infer<typeof InstantAnswer>;

	export const Redirect = z.object({
		url: z.string(),
		bang: z.object({
			trigger: z.string(),
			name: z.string(),
			source: z.enum(["user", "instance", "ddg", "internal"]),
		}),
	});
	export type Redirect = z.infer<typeof Redirect>;

	export const Response = z.object({
		query: z.string().describe("The query that was searched (bangs stripped)"),
		raw_query: z.string(),
		category: SearchTypes.Category,
		page: z.number(),
		redirect: Redirect.nullable().describe("Set when a bang matched — the client should navigate"),
		category_redirect: SearchTypes.Category.nullable().describe(
			"Set when an internal bang (e.g. `!i`) switched the category",
		),
		results: z.array(Result),
		instant_answers: z.array(InstantAnswer),
		suggestions: z.array(z.string()),
		corrections: z.array(z.string()),
		engines: z.array(EngineStatus),
		number_of_results: z.number(),
		time_ms: z.number(),
		cached: z.boolean(),
		ai_available: z
			.boolean()
			.describe("Whether the caller can request an AI answer for this search (signed-in users only)"),
	});
	export type Response = z.infer<typeof Response>;
}
