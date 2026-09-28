import { z } from "zod";
import { SearchModels, SearchTypes } from "../../../../../../search/types";

const HealthSnapshot = z.object({
	suspended_until: z.number().nullable(),
	consecutive_failures: z.number(),
	last_error: z.string().nullable(),
	last_error_at: z.number().nullable(),
	last_success_at: z.number().nullable(),
	last_latency_ms: z.number().nullable(),
	requests_last_minute: z.number().describe("Upstream requests in the last 60 seconds"),
});

export const Features = z.object({
	paging: z.boolean(),
	timeRange: z.boolean(),
	safeSearch: z.boolean(),
	language: z.boolean(),
});

export namespace AdminEnginesModel {
	export const Engine = z.object({
		id: z.number(),
		slug: z.string(),
		name: z.string(),
		engine_type: z.string(),
		enabled: z.boolean(),
		categories: z.array(SearchTypes.Category),
		weight: z.number(),
		timeout_ms: z.number(),
		proxy_ids: z.array(z.number()),
		fallback: z.boolean(),
		rate_limit_per_minute: z.number(),
		settings: z.record(z.string(), z.any()).describe("Settings without secret fields"),
		secrets_set: z.array(z.string()).describe("Secret settings that have a value"),
		created_at: z.number(),
		health: HealthSnapshot,
		load_error: z.string().nullable(),
	});
	export type Engine = z.infer<typeof Engine>;

	export const EngineType = z.object({
		type: z.string(),
		name: z.string(),
		description: z.string(),
		website: z.string(),
		categories: z.array(SearchTypes.Category),
		features: Features,
		settings_schema: z.record(z.string(), z.any()).describe("JSON Schema of the settings"),
		default_settings: z.record(z.string(), z.any()),
		secret_fields: z.array(z.string()),
		requires_configuration: z.boolean(),
		default_timeout_ms: z.number(),
		default_rate_limit_per_minute: z.number(),
	});

	export const Params = z.object({ engineID: z.coerce.number().int().positive() });
	export type Params = z.infer<typeof Params>;

	// Without defaults: zod applies defaults inside `.partial()` too, so an update body built from
	// `Body` would reset every omitted field.
	const fields = {
		slug: z
			.string()
			.trim()
			.regex(/^[a-z0-9][a-z0-9-]{1,47}$/, "2–48 lowercase letters, digits and dashes"),
		name: z.string().trim().min(1).max(64),
		engine_type: z.string().min(1).max(64),
		enabled: z.boolean(),
		categories: z.array(SearchTypes.Category).min(1),
		weight: z.number().min(0).max(10),
		timeout_ms: z.number().int().min(500).max(30_000),
		proxy_ids: z.array(z.number().int().positive()).max(50),
		fallback: z.boolean().describe("Only query this engine when too few regular engines answer"),
		rate_limit_per_minute: z
			.number()
			.int()
			.min(0)
			.max(10_000)
			.describe("Upstream requests per minute; 0 = unlimited"),
		settings: z.record(z.string(), z.any()),
	};

	export const Body = z.object({
		...fields,
		enabled: fields.enabled.default(true),
		weight: fields.weight.default(1),
		timeout_ms: fields.timeout_ms.default(4000),
		proxy_ids: fields.proxy_ids.default([]),
		fallback: fields.fallback.default(false),
		rate_limit_per_minute: fields.rate_limit_per_minute.optional(),
		settings: fields.settings.default({}),
	});
	export type Body = z.infer<typeof Body>;

	export const UpdateBody = z.object(fields).partial().omit({ engine_type: true });
	export type UpdateBody = z.infer<typeof UpdateBody>;

	export const TestBody = z.object({
		query: z.string().trim().min(1).max(200).default("open source"),
		category: SearchTypes.Category.optional(),
	});
	export type TestBody = z.infer<typeof TestBody>;

	export const TestResponse = z.object({
		ok: z.boolean(),
		status: SearchModels.EngineStatus.shape.status,
		time_ms: z.number(),
		results: z.number(),
		error: z.string().nullable(),
		sample: z.array(SearchModels.Result),
	});
	export type TestResponse = z.infer<typeof TestResponse>;
}
