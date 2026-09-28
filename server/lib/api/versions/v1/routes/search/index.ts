import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { AIService } from "../../../../../ai";
import { BangService } from "../../../../../bangs";
import { AutocompleteService } from "../../../../../search/autocomplete";
import { SearchService } from "../../../../../search/service";
import type { SearchTypes } from "../../../../../search/types";
import { SettingsHandler } from "../../../../../settings";
import { Logger } from "../../../../../utils/logger";
import { AIAccess } from "../../../../utils/aiAccess";
import { APIResponse } from "../../../../utils/api-res";
import { RequestInfo } from "../../../../utils/requestInfo";
import { SearchAccess } from "../../../../utils/searchAccess";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { SearchModel } from "./model";

export const router = new Hono().basePath("/search");

router.get(
	"/",

	APIRouteSpec.custom({
		summary: "Search",
		description:
			"Run a metasearch. Bangs are resolved first: when one matches, `redirect` is set and no engines run. Works without authentication only when the instance is public.",
		tags: [DOCS_TAGS.SEARCH],
		security: [{ bearerAuth: [] }, {}],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Search completed", SearchModel.Search.Response),
			APIResponseSpec.unauthorized("This instance requires you to sign in to search"),
			APIResponseSpec.tooManyRequests("Too many searches"),
		),
	}),

	zValidator("query", SearchModel.Search.Query),

	async (c) => {
		const access = await SearchAccess.check(c);
		if (!access.ok) return access.response;

		const query = c.req.valid("query") as SearchModel.Search.Query;
		const preferences = await SettingsHandler.getEffectivePreferences(access.userID);

		const result = await SearchService.search(
			{
				query: query.q,
				category: query.category,
				page: query.page,
				language: query.language,
				safesearch: query.safesearch as SearchTypes.SafeSearch | undefined,
				timeRange: query.time_range ?? null,
				engines: query.engines
					?.split(",")
					.map((e) => e.trim())
					.filter(Boolean),
			},
			{
				userID: access.userID,
				preferences,
				clientIP: RequestInfo.clientIP(c),
				userAgent: RequestInfo.userAgent(c),
			},
		);

		return APIResponse.success(c, "Search completed", result satisfies SearchModel.Search.Response);
	},
);

router.get(
	"/autocomplete",

	APIRouteSpec.custom({
		summary: "Autocomplete",
		description:
			"Search suggestions from the user's autocomplete provider, plus bang suggestions when the last token starts with `!`.",
		tags: [DOCS_TAGS.SEARCH],
		security: [{ bearerAuth: [] }, {}],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Suggestions retrieved", SearchModel.Autocomplete.Response),
			APIResponseSpec.unauthorized("This instance requires you to sign in to search"),
		),
	}),

	zValidator("query", SearchModel.Autocomplete.Query),

	async (c) => {
		const access = await SearchAccess.check(c);
		if (!access.ok) return access.response;

		const { q } = c.req.valid("query") as SearchModel.Autocomplete.Query;
		const preferences = await SettingsHandler.getEffectivePreferences(access.userID);

		const lastToken = q.split(/\s+/).at(-1) ?? "";
		const wantsBang = preferences.bangs_enabled && lastToken.startsWith("!");

		const [suggestions, bangs] = await Promise.all([
			wantsBang
				? Promise.resolve([])
				: AutocompleteService.suggest(q, preferences.autocomplete, preferences.language),
			wantsBang
				? BangService.suggest(lastToken, {
						userID: access.userID,
						includeDDG: preferences.ddg_bangs_enabled,
					})
				: Promise.resolve([]),
		]);

		return APIResponse.success(c, "Suggestions retrieved", {
			suggestions,
			bangs: bangs.map((b) => BangService.toPublic(b)),
		} satisfies SearchModel.Autocomplete.Response);
	},
);

router.get(
	"/suggest/opensearch",

	describeRoute({
		summary: "OpenSearch suggestions",
		description:
			"Browser address-bar suggestions in the OpenSearch format `[query, [suggestions…]]` (`application/x-suggestions+json`). Accepts the session cookie. Not wrapped in the response envelope.",
		tags: [DOCS_TAGS.SEARCH],
		security: [{ bearerAuth: [] }, {}],
		responses: { 200: { description: "OpenSearch suggestions" } },
	}),

	zValidator("query", SearchModel.Autocomplete.Query),

	async (c) => {
		const { q } = c.req.valid("query") as SearchModel.Autocomplete.Query;
		const access = await SearchAccess.check(c);
		c.header("Content-Type", "application/x-suggestions+json");
		if (!access.ok) return c.body(JSON.stringify([q, []]));

		const preferences = await SettingsHandler.getEffectivePreferences(access.userID);
		const suggestions = await AutocompleteService.suggest(
			q,
			preferences.autocomplete,
			preferences.language,
		);
		return c.body(JSON.stringify([q, suggestions]));
	},
);

router.post(
	"/ai",

	APIRouteSpec.authenticated({
		summary: "AI answer",
		description:
			"Answer the query with the configured OpenAI compatible model, grounded in the top search results (cited as [n]). Requires sign-in, also on public instances. With `stream: true` (default) the response is `text/event-stream` with the events `sources`, `delta` (`{ text }`), `done` (`{ model }`, `null` unless the caller is an admin) and `error`; otherwise the JSON envelope below. Follow-up questions go to `POST /ai/chats`.",
		tags: [DOCS_TAGS.SEARCH],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("AI answer generated", SearchModel.AI.Response),
			APIResponseSpec.unauthorized("Sign in to use AI answers"),
			APIResponseSpec.forbidden("AI answers are not available"),
			APIResponseSpec.serverError("The AI endpoint failed"),
		),
	}),

	zValidator("json", SearchModel.AI.Body),

	async (c) => {
		const access = await AIAccess.check(c);
		if (!access.ok) return access.response;

		const body = c.req.valid("json") as SearchModel.AI.Body;
		const { config } = access;
		const model = access.showModel ? config.model : null;

		const results = await AIAccess.groundingResults(c, access, body.q, body.language);
		const sources = AIService.sources(results);
		const messages = AIService.buildMessages(body.q, results, config);

		if (!body.stream) {
			try {
				const answer = await AIService.answer(messages, config, c.req.raw.signal);
				return APIResponse.success(c, "AI answer generated", {
					answer,
					model,
					sources,
				} satisfies SearchModel.AI.Response);
			} catch (err) {
				Logger.warn("AI answer failed:", (err as Error).message);
				return APIResponse.serverError(c, "The AI endpoint failed");
			}
		}

		return streamSSE(c, async (stream) => {
			await stream.writeSSE({ event: "sources", data: JSON.stringify(sources) });
			try {
				for await (const text of AIService.stream(messages, config, c.req.raw.signal)) {
					if (stream.aborted) break;
					await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
				}
				await stream.writeSSE({ event: "done", data: JSON.stringify({ model }) });
			} catch (err) {
				Logger.warn("AI stream failed:", (err as Error).message);
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({ message: "The AI endpoint failed" }),
				});
			}
		});
	},
);
