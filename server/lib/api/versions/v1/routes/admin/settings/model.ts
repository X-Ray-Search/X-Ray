import { z } from "zod";
import { SettingsModels } from "../../../../../../settings/models";

export namespace AdminSettingsModel {
	export namespace Instance {
		export const Response = SettingsModels.Instance;
		export const Body = SettingsModels.Instance.partial();
		export type Body = z.infer<typeof Body>;
	}

	export namespace SearchDefaults {
		export const Response = SettingsModels.SearchPreferences;
		export const Body = SettingsModels.SearchPreferences.partial();
		export type Body = z.infer<typeof Body>;
	}

	export namespace AI {
		export const Response = SettingsModels.AIConfigPublic;
		/** `api_key`: omit to keep the stored key, `null` to remove it. */
		export const Body = SettingsModels.AIConfig.omit({ api_key: true })
			.partial()
			.extend({ api_key: z.string().max(1024).nullable().optional() });
		export type Body = z.infer<typeof Body>;

		export const TestResponse = z.object({
			ok: z.boolean(),
			latency_ms: z.number(),
			reply: z.string().nullable(),
			error: z.string().nullable(),
		});

		export const ModelsResponse = z.object({
			models: z.array(z.string()),
			error: z.string().nullable(),
		});
	}
}
