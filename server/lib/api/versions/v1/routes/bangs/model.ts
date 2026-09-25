import { z } from "zod";
import { SearchTypes } from "../../../../../search/types";
import { BangSuggestion } from "../search/model";

export namespace BangsModel {
	export namespace Suggest {
		export const Query = z.object({
			q: z.string().min(1).max(64).describe("Bang prefix, with or without the leading `!`"),
			limit: z.coerce.number().int().min(1).max(25).default(8),
		});
		export type Query = z.infer<typeof Query>;

		export const Response = z.array(BangSuggestion);
		export type Response = z.infer<typeof Response>;
	}

	export namespace Resolve {
		export const Query = z.object({
			q: z.string().trim().min(1).max(500),
		});
		export type Query = z.infer<typeof Query>;

		export const Response = z.object({
			kind: z.enum(["redirect", "category", "lucky", "none"]),
			url: z.string().nullable(),
			category: SearchTypes.Category.nullable(),
			query: z.string().describe("The query with the bang removed"),
			bang: BangSuggestion.pick({ trigger: true, name: true, source: true }).nullable(),
		});
		export type Response = z.infer<typeof Response>;
	}
}
