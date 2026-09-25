import { z } from "zod";
import { SearchModels, SearchTypes } from "../../../../../search/types";

export const Locale = z
	.string()
	.regex(/^(all|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/, "Use `all` or a locale like `en` / `en-US`");

export const BangSuggestion = z.object({
	trigger: z.string(),
	name: z.string(),
	domain: z.string(),
	category: z.string().nullable(),
	source: z.enum(["user", "instance", "internal", "ddg"]),
	switches_category: SearchTypes.Category.nullable(),
});

export namespace SearchModel.Search {
	export const Query = z.object({
		q: z.string().trim().min(1).max(500).describe("The query, may contain a !bang"),
		category: SearchTypes.Category.optional().describe("Defaults to the user's default category"),
		page: z.coerce.number().int().min(1).max(20).default(1),
		language: Locale.optional(),
		safesearch: z.coerce.number().int().min(0).max(2).optional().describe("0 off, 1 moderate, 2 strict"),
		time_range: SearchTypes.TimeRange.optional(),
		engines: z.string().max(500).optional().describe("Comma separated engine slugs to restrict the search to"),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = SearchModels.Response;
	export type Response = z.infer<typeof Response>;
}

export namespace SearchModel.Autocomplete {
	export const Query = z.object({
		q: z.string().max(200),
	});
	export type Query = z.infer<typeof Query>;

	export const Response = z.object({
		suggestions: z.array(z.string()),
		bangs: z.array(BangSuggestion).describe("Bang suggestions when the last token starts with `!`"),
	});
	export type Response = z.infer<typeof Response>;
}

export namespace SearchModel.AI {
	export const Body = z.object({
		q: z.string().trim().min(1).max(500),
		language: Locale.optional(),
		stream: z.boolean().default(true).describe("Stream as Server-Sent Events (default) or return JSON"),
	});
	export type Body = z.infer<typeof Body>;

	export const Source = z.object({ index: z.number(), title: z.string(), url: z.string() });

	export const Response = z.object({
		answer: z.string(),
		model: z.string(),
		sources: z.array(Source),
	});
	export type Response = z.infer<typeof Response>;
}
