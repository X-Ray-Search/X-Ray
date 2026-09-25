import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { DB } from "../../../db";

export namespace CustomBangModels {
	export const Bang = createSelectSchema(DB.Tables.bangs).omit({ owner_user_id: true });
	export type Bang = z.infer<typeof Bang>;

	export const Body = z.object({
		trigger: z
			.string()
			.trim()
			.regex(/^!?[a-z0-9][a-z0-9._+-]{0,31}$/i, "1–32 characters: letters, digits, . _ + -")
			.transform((value) => value.replace(/^!/, "").toLowerCase()),
		name: z.string().trim().min(1).max(64),
		url_template: z
			.string()
			.trim()
			.max(2048)
			.refine((value) => {
				try {
					const url = new URL(value.replace(/\{\{\{s\}\}\}|%s/g, "x"));
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			}, "Must be an http(s) URL; use {{{s}}} or %s where the query goes"),
		category: z.string().trim().max(64).nullable().default(null),
	});
	export type Body = z.infer<typeof Body>;

	export const Params = z.object({
		bangID: z.coerce.number().int().positive(),
	});
	export type Params = z.infer<typeof Params>;
}
