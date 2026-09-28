import { z } from "zod";
import { ProxyTransport } from "../../../../../../proxy/transport";

export namespace AdminProxiesModel {
	export const Item = z.object({
		id: z.number(),
		name: z.string(),
		proxy_type: z.string(),
		enabled: z.boolean(),
		settings: z.record(z.string(), z.any()).describe("Settings without secret fields"),
		secrets_set: z.array(z.string()),
		created_at: z.number(),
		used_by_engines: z.array(z.string()).describe("Slugs of engines routed through this proxy"),
		is_default: z.boolean().describe("Part of the instance default proxy list"),
	});
	export type Item = z.infer<typeof Item>;

	export const ProxyType = z.object({
		type: z.string(),
		name: z.string(),
		description: z.string(),
		settings_schema: z.record(z.string(), z.any()),
		default_settings: z.record(z.string(), z.any()),
		secret_fields: z.array(z.string()),
	});

	export const Params = z.object({ proxyID: z.coerce.number().int().positive() });
	export type Params = z.infer<typeof Params>;

	export const Body = z.object({
		name: z.string().trim().min(1).max(64),
		proxy_type: z.string().min(1).max(64),
		enabled: z.boolean().default(true),
		settings: z.record(z.string(), z.any()).default({}),
	});
	export type Body = z.infer<typeof Body>;

	export const UpdateBody = Body.partial().omit({ proxy_type: true });
	export type UpdateBody = z.infer<typeof UpdateBody>;

	export const TestConfigBody = Body.pick({ proxy_type: true, settings: true });
	export type TestConfigBody = z.infer<typeof TestConfigBody>;

	export const TestResponse = ProxyTransport.TestResult;
}
