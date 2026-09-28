import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { AIService } from "../../../../../../ai";
import { DB } from "../../../../../../db";
import { ProxyManager } from "../../../../../../proxy";
import { EngineRunCache } from "../../../../../../search/runCache";
import { SettingsHandler } from "../../../../../../settings";
import type { SettingsModels } from "../../../../../../settings/models";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminSettingsModel } from "./model";

export const router = new Hono().basePath("/settings");

/** Merge an AI config update: omitted key → keep, null → clear. */
async function mergeAIConfig(body: AdminSettingsModel.AI.Body): Promise<SettingsModels.AIConfig> {
	const current = await SettingsHandler.getAIConfig();
	const { api_key, ...rest } = body;
	return { ...current, ...rest, api_key: api_key === undefined ? current.api_key : (api_key ?? "") };
}

router.get(
	"/instance",
	APIRouteSpec.authenticated({
		summary: "Get instance settings",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instance settings retrieved", AdminSettingsModel.Instance.Response),
		),
	}),
	async (c) =>
		APIResponse.success(c, "Instance settings retrieved", await SettingsHandler.getInstance()),
);

router.put(
	"/instance",
	APIRouteSpec.authenticated({
		summary: "Update instance settings",
		description:
			"Partial update of the instance settings (access mode, SearXNG API, default proxies, …).",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Instance settings updated", AdminSettingsModel.Instance.Response),
		),
	}),
	zValidator("json", AdminSettingsModel.Instance.Body),
	async (c) => {
		const body = c.req.valid("json") as AdminSettingsModel.Instance.Body;
		if (body.default_proxy_ids?.length) {
			const found = await DB.instance()
				.select({ id: DB.Tables.proxies.id })
				.from(DB.Tables.proxies)
				.where(inArray(DB.Tables.proxies.id, body.default_proxy_ids))
				.all();
			if (found.length !== new Set(body.default_proxy_ids).size) {
				return APIResponse.badRequest(c, "Unknown proxy id in default_proxy_ids");
			}
		}
		const updated = await SettingsHandler.updateInstance(body);
		await ProxyManager.reload();
		EngineRunCache.configure({ persistent: updated.search_cache_persistent });
		return APIResponse.success(c, "Instance settings updated", updated);
	},
);

router.get(
	"/search-defaults",
	APIRouteSpec.authenticated({
		summary: "Get search defaults",
		description: "Instance-wide search preferences. Users can override each of them personally.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Search defaults retrieved", AdminSettingsModel.SearchDefaults.Response),
		),
	}),
	async (c) =>
		APIResponse.success(c, "Search defaults retrieved", await SettingsHandler.getSearchDefaults()),
);

router.put(
	"/search-defaults",
	APIRouteSpec.authenticated({
		summary: "Update search defaults",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Search defaults updated", AdminSettingsModel.SearchDefaults.Response),
		),
	}),
	zValidator("json", AdminSettingsModel.SearchDefaults.Body),
	async (c) => {
		const body = c.req.valid("json") as AdminSettingsModel.SearchDefaults.Body;
		const updated = await SettingsHandler.updateSearchDefaults(body);
		return APIResponse.success(c, "Search defaults updated", updated);
	},
);

router.get(
	"/ai",
	APIRouteSpec.authenticated({
		summary: "Get AI settings",
		description: "The OpenAI compatible endpoint configuration. The API key is never returned.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("AI settings retrieved", AdminSettingsModel.AI.Response),
		),
	}),
	async (c) =>
		APIResponse.success(
			c,
			"AI settings retrieved",
			SettingsHandler.toPublicAIConfig(await SettingsHandler.getAIConfig()),
		),
);

router.put(
	"/ai",
	APIRouteSpec.authenticated({
		summary: "Update AI settings",
		description: "Partial update. Omit `api_key` to keep the stored key, send `null` to remove it.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("AI settings updated", AdminSettingsModel.AI.Response),
		),
	}),
	zValidator("json", AdminSettingsModel.AI.Body),
	async (c) => {
		const merged = await mergeAIConfig(c.req.valid("json") as AdminSettingsModel.AI.Body);
		const updated = await SettingsHandler.updateAIConfig(merged);
		return APIResponse.success(c, "AI settings updated", SettingsHandler.toPublicAIConfig(updated));
	},
);

router.post(
	"/ai/test",
	APIRouteSpec.authenticated({
		summary: "Test AI settings",
		description:
			"Send a trivial prompt. Values in the body override the stored settings for this test only.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("AI endpoint tested", AdminSettingsModel.AI.TestResponse),
		),
	}),
	zValidator("json", AdminSettingsModel.AI.Body),
	async (c) => {
		const config = await mergeAIConfig(c.req.valid("json") as AdminSettingsModel.AI.Body);
		return APIResponse.success(c, "AI endpoint tested", await AIService.test(config));
	},
);

router.post(
	"/ai/models",
	APIRouteSpec.authenticated({
		summary: "List AI models",
		description:
			"Models offered by the endpoint (`GET /models`). Body values override the stored settings.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Models retrieved", AdminSettingsModel.AI.ModelsResponse),
		),
	}),
	zValidator("json", AdminSettingsModel.AI.Body),
	async (c) => {
		const config = await mergeAIConfig(c.req.valid("json") as AdminSettingsModel.AI.Body);
		try {
			return APIResponse.success(c, "Models retrieved", {
				models: await AIService.listModels(config),
				error: null,
			});
		} catch (err) {
			return APIResponse.success(c, "Models retrieved", { models: [], error: (err as Error).message });
		}
	},
);

router.get(
	"/cache",
	APIRouteSpec.authenticated({
		summary: "Get search cache statistics",
		description: "Size of the engine result cache and hit counters since the last restart.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Search cache statistics retrieved", AdminSettingsModel.CacheStats),
		),
	}),
	async (c) => APIResponse.success(c, "Search cache statistics retrieved", EngineRunCache.stats()),
);

router.post(
	"/cache/clear",
	APIRouteSpec.authenticated({
		summary: "Clear the search cache",
		description: "Drops all cached engine results, in memory and on disk.",
		tags: [DOCS_TAGS.ADMIN_API.SETTINGS],
		responses: APIResponseSpec.describeBasic(APIResponseSpec.successNoData("Search cache cleared")),
	}),
	async (c) => {
		EngineRunCache.clear();
		return APIResponse.successNoData(c, "Search cache cleared");
	},
);
