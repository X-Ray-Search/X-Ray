import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validator as zValidator } from "hono-openapi";
import { AIService } from "../../../../../ai";
import { AIChats } from "../../../../../ai/chats";
import { Logger } from "../../../../../utils/logger";
import { AIAccess } from "../../../../utils/aiAccess";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { AIChatModel } from "./model";

/**
 * AI chats ("AI mode"): follow-up questions on an AI answer, stored per user. Answers are grounded
 * in a fresh web search; follow-ups are first rewritten into a standalone query — or answered from
 * the conversation alone when no web search is needed.
 */
export const router = new Hono().basePath("/ai");

router.get(
	"/chats",

	APIRouteSpec.authenticated({
		summary: "List AI chats",
		description: "The caller's AI chats, most recently active first.",
		tags: [DOCS_TAGS.AI],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Chats retrieved", AIChatModel.Summary.array()),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
		),
	}),

	async (c) => {
		const user = AIAccess.authenticate(c);
		if (!user.ok) return user.response;

		const chats = await AIChats.list(user.userID);
		return APIResponse.success(c, "Chats retrieved", chats satisfies AIChatModel.Summary[]);
	},
);

router.post(
	"/chats",

	APIRouteSpec.authenticated({
		summary: "Create an AI chat",
		description:
			"Start a chat, optionally seeded with earlier turns (e.g. the query and AI answer of a search). Send messages with `POST /ai/chats/{chatID}/messages`. Chats without messages are not listed.",
		tags: [DOCS_TAGS.AI],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Chat created", AIChatModel.Summary),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
			APIResponseSpec.forbidden("AI answers are not available"),
		),
	}),

	zValidator("json", AIChatModel.Create.Body),

	async (c) => {
		const access = await AIAccess.check(c);
		if (!access.ok) return access.response;

		const body = c.req.valid("json") as AIChatModel.Create.Body;
		const chat = await AIChats.create(access.userID, body.messages);
		return APIResponse.created(c, "Chat created", chat satisfies AIChatModel.Summary);
	},
);

router.get(
	"/chats/:chatID",

	APIRouteSpec.authenticated({
		summary: "Get an AI chat",
		description: "A chat with all of its messages.",
		tags: [DOCS_TAGS.AI],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Chat retrieved", AIChatModel.Chat),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
			APIResponseSpec.notFound("Chat not found"),
		),
	}),

	zValidator("param", AIChatModel.Params),

	async (c) => {
		const user = AIAccess.authenticate(c);
		if (!user.ok) return user.response;

		const { chatID } = c.req.valid("param") as AIChatModel.Params;
		const chat = await AIChats.get(user.userID, chatID);
		if (!chat) return APIResponse.notFound(c, "Chat not found");

		return APIResponse.success(c, "Chat retrieved", {
			...chat,
			messages: await AIChats.messages(chat.id),
		} satisfies AIChatModel.Chat);
	},
);

router.delete(
	"/chats/:chatID",

	APIRouteSpec.authenticated({
		summary: "Delete an AI chat",
		tags: [DOCS_TAGS.AI],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.successNoData("Chat deleted"),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
			APIResponseSpec.notFound("Chat not found"),
		),
	}),

	zValidator("param", AIChatModel.Params),

	async (c) => {
		const user = AIAccess.authenticate(c);
		if (!user.ok) return user.response;

		const { chatID } = c.req.valid("param") as AIChatModel.Params;
		if (!(await AIChats.delete(user.userID, chatID))) {
			return APIResponse.notFound(c, "Chat not found");
		}
		return APIResponse.successNoData(c, "Chat deleted");
	},
);

router.post(
	"/chats/:chatID/messages",

	APIRouteSpec.authenticated({
		summary: "Send a message",
		description:
			"Ask a (follow-up) question in a chat. Follow-ups are rewritten into a standalone web search using the conversation, or answered from the conversation alone when no web search is needed. Grounded answers cite the search's top results as [n]. The turn is stored once the answer is complete — a stopped answer is kept as far as it got. With `stream: true` (default) the response is `text/event-stream` with the events `search` (`{ query }`, `null` when no web search was made), `sources` (empty without a web search), `delta` (`{ text }`), `done` (the JSON response below) and `error`; otherwise the JSON envelope below.",
		tags: [DOCS_TAGS.AI],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Answer generated", AIChatModel.Send.Response),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
			APIResponseSpec.forbidden("AI answers are not available"),
			APIResponseSpec.notFound("Chat not found"),
			APIResponseSpec.serverError("The AI endpoint failed"),
		),
	}),

	zValidator("param", AIChatModel.Params),
	zValidator("json", AIChatModel.Send.Body),

	async (c) => {
		const access = await AIAccess.check(c);
		if (!access.ok) return access.response;

		const { chatID } = c.req.valid("param") as AIChatModel.Params;
		const body = c.req.valid("json") as AIChatModel.Send.Body;
		const chat = await AIChats.get(access.userID, chatID);
		if (!chat) return APIResponse.notFound(c, "Chat not found");

		const { config } = access;
		const signal = c.req.raw.signal;
		const history = await AIChats.messages(chat.id);
		const model = access.showModel ? config.model : null;

		/** The grounding for a turn: no search query (`null`) answers from the conversation alone. */
		const search = async (searchQuery: string | null) => {
			const results =
				searchQuery === null
					? null
					: await AIAccess.groundingResults(c, access, searchQuery, body.language);
			return {
				sources: results ? AIService.sources(results) : [],
				messages: AIService.buildChatMessages(history, body.content, results, config),
			};
		};

		const save = async (
			answer: string,
			searchQuery: string | null,
			sources: AIService.Source[],
		): Promise<AIChatModel.Send.Response> => {
			const message = await AIChats.addTurn(chat.id, body.content, {
				content: answer,
				sources,
				search_query: searchQuery,
			});
			const updated = (await AIChats.get(access.userID, chat.id)) ?? chat;
			return { message, model, chat: updated };
		};

		if (!body.stream) {
			try {
				const searchQuery = await AIService.searchQuery(history, body.content, config, signal);
				const { sources, messages } = await search(searchQuery);
				const answer = await AIService.answer(messages, config, signal);
				return APIResponse.success(c, "Answer generated", await save(answer, searchQuery, sources));
			} catch (err) {
				Logger.warn("AI chat answer failed:", (err as Error).message);
				return APIResponse.serverError(c, "The AI endpoint failed");
			}
		}

		return streamSSE(c, async (stream) => {
			const fail = () =>
				stream.writeSSE({
					event: "error",
					data: JSON.stringify({ message: "The AI endpoint failed" }),
				});

			let searchQuery: string | null = body.content;
			let sources: AIService.Source[] = [];
			let answer = "";
			try {
				searchQuery = await AIService.searchQuery(history, body.content, config, signal);
				await stream.writeSSE({ event: "search", data: JSON.stringify({ query: searchQuery }) });

				const turn = await search(searchQuery);
				sources = turn.sources;
				// Sent on every turn (empty without a web search), so clients can rely on it.
				await stream.writeSSE({ event: "sources", data: JSON.stringify(sources) });

				for await (const text of AIService.stream(turn.messages, config, signal)) {
					if (stream.aborted) break;
					answer += text;
					await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
				}
			} catch (err) {
				Logger.warn("AI chat stream failed:", (err as Error).message);
				if (!answer) return void (await fail());
			}

			if (!answer.trim()) return void (await fail());
			await stream.writeSSE({
				event: "done",
				data: JSON.stringify(await save(answer, searchQuery, sources)),
			});
		});
	},
);
