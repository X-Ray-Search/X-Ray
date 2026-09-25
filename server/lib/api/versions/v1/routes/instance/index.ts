import { Hono } from "hono";
import { InstantAnswerService } from "../../../../../instant-answers";
import { AutocompleteService } from "../../../../../search/autocomplete";
import { SearchEngineManager } from "../../../../../search/manager";
import { SearchTypes } from "../../../../../search/types";
import { SettingsHandler } from "../../../../../settings";
import { AppConstants } from "../../../../../utils/constants";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { InstanceModel } from "./model";

export const router = new Hono().basePath("/instance");

router.get(
	"/",

	APIRouteSpec.unauthenticated({
		summary: "Instance information",
		description:
			"Public information about this X-Ray instance: access mode, categories, enabled engines, available instant answers and the instance-wide search defaults.",
		tags: [DOCS_TAGS.INSTANCE],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Instance information retrieved", InstanceModel.Info.Response),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.get(c);
		const [settings, defaults, engines, aiAvailable] = await Promise.all([
			SettingsHandler.getInstance(),
			SettingsHandler.getSearchDefaults(),
			SearchEngineManager.all(),
			SettingsHandler.isAIAvailable(),
		]);
		const authenticated = authContext.type !== "unauthenticated";

		return APIResponse.success(c, "Instance information retrieved", {
			name: settings.instance_name,
			version: AppConstants.APP_VERSION,
			search_access: settings.search_access,
			authenticated,
			can_search: authenticated || settings.search_access === "public",
			categories: SearchTypes.Categories.map((id) => ({
				id,
				name: SearchTypes.CategoryInfo[id].name,
				icon: SearchTypes.CategoryInfo[id].icon,
			})),
			features: { ai: aiAvailable, searxng_api: settings.searxng_api_enabled },
			engines: engines.map((e) => ({ slug: e.config.slug, name: e.config.name, categories: [...e.config.categories] })),
			instant_answer_providers: InstantAnswerService.list().map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				examples: [...p.examples],
			})),
			autocomplete_providers: [
				{ id: "none", name: "Off" },
				...Object.entries(AutocompleteService.PROVIDERS).map(([id, p]) => ({ id, name: p.name })),
			],
			search_defaults: defaults,
		} satisfies InstanceModel.Info.Response);
	},
);
