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

	export const CacheStats = z.object({
		persistent: z.boolean().describe("Whether the disk tier is in use"),
		memory_entries: z.number(),
		disk_entries: z.number(),
		disk_bytes: z.number(),
		in_flight: z.number().describe("Engine requests currently running that others can join"),
		hits: z.number().describe("Engine runs answered from the cache"),
		misses: z.number().describe("Engine runs that had to ask the engine"),
		stale_served: z.number().describe("Times expired results stood in for an unavailable engine"),
		coalesced: z.number().describe("Requests that joined an identical one already running"),
		since: z.number().describe("When the counters started (epoch ms)"),
	});
}
