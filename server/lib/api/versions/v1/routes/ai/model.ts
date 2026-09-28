import { z } from "zod";
import { Locale } from "../search/model";

export namespace AIChatModel {
	export const Source = z.object({
		index: z.number().int().min(1).max(100),
		title: z.string().max(1000),
		url: z
			.string()
			.max(4096)
			.refine((value) => /^https?:\/\//i.test(value), "Must be an http(s) URL"),
	});

	export const Message = z.object({
		id: z.number(),
		role: z.enum(["user", "assistant"]),
		content: z.string(),
		sources: z.array(Source).describe("Search results the answer cites as [n]"),
		search_query: z
			.string()
			.nullable()
			.describe("The web search the answer is grounded in (follow-ups are rewritten)"),
		created_at: z.number(),
	});
	export type Message = z.infer<typeof Message>;

	export const Summary = z.object({
		id: z.number(),
		title: z.string(),
		created_at: z.number(),
		updated_at: z.number(),
	});
	export type Summary = z.infer<typeof Summary>;

	export const Chat = Summary.extend({ messages: z.array(Message) });
	export type Chat = z.infer<typeof Chat>;

	export const Params = z.object({
		chatID: z.coerce.number().int().positive(),
	});
	export type Params = z.infer<typeof Params>;
}

export namespace AIChatModel.Create {
	const SeedMessage = z.object({
		role: z.enum(["user", "assistant"]),
		content: z.string().trim().min(1).max(20_000),
		sources: z.array(AIChatModel.Source).max(20).default([]),
	});

	export const Body = z.object({
		messages: z
			.array(SeedMessage)
			.max(20)
			.default([])
			.refine(
				(messages) =>
					messages.length % 2 === 0 &&
					messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")),
				"Seed messages must be complete turns: a user message followed by the assistant's answer",
			)
			.describe(
				"Earlier turns to continue from, e.g. the query and AI answer of a search. Usually empty.",
			),
	});
	export type Body = z.infer<typeof Body>;
}

export namespace AIChatModel.Send {
	export const Body = z.object({
		content: z.string().trim().min(1).max(2000),
		language: Locale.optional(),
		stream: z
			.boolean()
			.default(true)
			.describe("Stream as Server-Sent Events (default) or return JSON"),
	});
	export type Body = z.infer<typeof Body>;

	export const Response = z.object({
		message: AIChatModel.Message.describe("The stored answer"),
		model: z.string().nullable().describe("The model that answered — only returned to admins"),
		chat: AIChatModel.Summary.describe("The chat after the turn (title, updated_at)"),
	});
	export type Response = z.infer<typeof Response>;
}
