import { z } from "zod";
import { SearchTypes } from "../../../../../search/types";
import { SettingsModels } from "../../../../../settings/models";

export namespace InstanceModel {
	export namespace Info {
		export const Response = z.object({
			name: z.string(),
			version: z.string(),
			search_access: SettingsModels.Instance.shape.search_access,
			authenticated: z.boolean().describe("Whether the request carried a valid session or API key"),
			can_search: z.boolean().describe("Whether the caller may search right now"),
			categories: z.array(z.object({ id: SearchTypes.Category, name: z.string(), icon: z.string() })),
			features: z.object({
				ai: z.boolean().describe("An AI endpoint is configured and enabled by the admin"),
				searxng_api: z.boolean(),
			}),
			engines: z.array(
				z.object({ slug: z.string(), name: z.string(), categories: z.array(SearchTypes.Category) }),
			),
			instant_answer_providers: z.array(
				z.object({ id: z.string(), name: z.string(), description: z.string(), examples: z.array(z.string()) }),
			),
			autocomplete_providers: z.array(z.object({ id: z.string(), name: z.string() })),
			search_defaults: SettingsModels.SearchPreferences,
		});
		export type Response = z.infer<typeof Response>;
	}
}
