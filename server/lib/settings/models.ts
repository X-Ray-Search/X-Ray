import { z } from "zod";
import { SearchTypes } from "../search/types";

/**
 * Settings schemas. Every settings object is flat so that a stored (possibly older) value can
 * be merged over the defaults with a shallow spread — new fields pick up their default
 * automatically.
 */
export namespace SettingsModels {
	// ---------------------------------------------------------------- instance settings (admin)

	export const Instance = z.object({
		instance_name: z.string().min(1).max(64),
		search_access: z
			.enum(["authenticated", "public"])
			.describe("`authenticated` (default): only signed-in users may search. `public`: anyone."),
		searxng_api_enabled: z.boolean().describe("Expose the SearXNG compatible API at /api/searxng"),
		searxng_api_require_key: z
			.boolean()
			.describe("Require an API key for the SearXNG API even when search access is public"),
		default_proxy_ids: z
			.array(z.number().int().positive())
			.describe("Proxies used by engines and outbound fetches that have none configured"),
		ddg_bangs_auto_update: z.boolean(),
		ddg_bangs_update_interval_hours: z
			.number()
			.int()
			.min(1)
			.max(24 * 90),
		public_rate_limit_per_minute: z
			.number()
			.int()
			.min(0)
			.max(10_000)
			.describe("Searches per minute and IP for unauthenticated users. 0 = unlimited."),
	});
	export type Instance = z.infer<typeof Instance>;

	export const INSTANCE_DEFAULTS: Instance = {
		instance_name: "X-Ray",
		search_access: "authenticated",
		searxng_api_enabled: true,
		searxng_api_require_key: true,
		default_proxy_ids: [],
		ddg_bangs_auto_update: true,
		ddg_bangs_update_interval_hours: 24 * 7,
		public_rate_limit_per_minute: 60,
	};

	// ------------------------------------------------- search preferences (instance + per user)

	export const AutocompleteProviders = [
		"none",
		"duckduckgo",
		"google",
		"brave",
		"wikipedia",
	] as const;

	const searchPreferenceFields = {
		default_category: SearchTypes.Category,
		language: z
			.string()
			.min(2)
			.max(16)
			.regex(/^(all|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/, "Use `all` or a locale like `en` / `en-US`"),
		safesearch: SearchTypes.SafeSearch,
		open_in_new_tab: z.boolean(),
		image_proxy: z.boolean().describe("Load thumbnails and favicons through X-Ray"),
		autocomplete: z.enum(AutocompleteProviders),
		bangs_enabled: z.boolean(),
		ddg_bangs_enabled: z.boolean().describe("Include the DuckDuckGo bang dataset"),
		instant_answers_enabled: z.boolean(),
		disabled_instant_answers: z.array(z.string().max(64)).max(100),
		ai_mode: z
			.enum(["off", "manual", "auto"])
			.describe("`manual`: show an 'Ask AI' button. `auto`: generate an answer for every search."),
		disabled_engines: z.array(z.string().max(64)).max(200),
		units: z.enum(["metric", "imperial"]),
	};

	export const SearchPreferences = z.object(searchPreferenceFields);
	export type SearchPreferences = z.infer<typeof SearchPreferences>;

	/** Per-user overrides: any subset of the search preferences. Absent keys follow the instance. */
	export const SearchPreferenceOverrides = z.object(searchPreferenceFields).partial();
	export type SearchPreferenceOverrides = z.infer<typeof SearchPreferenceOverrides>;

	export const SEARCH_PREFERENCE_DEFAULTS: SearchPreferences = {
		default_category: "general",
		language: "all",
		safesearch: 1,
		open_in_new_tab: false,
		image_proxy: true,
		autocomplete: "duckduckgo",
		bangs_enabled: true,
		ddg_bangs_enabled: true,
		instant_answers_enabled: true,
		disabled_instant_answers: [],
		ai_mode: "manual",
		disabled_engines: [],
		units: "metric",
	};

	// ------------------------------------------------------------------ AI integration (admin)

	export const DEFAULT_AI_SYSTEM_PROMPT = [
		"You are the answer assistant of a privacy-respecting search engine.",
		"Answer the user's query concisely using ONLY the numbered search results provided.",
		"Cite sources inline with their number in square brackets, e.g. [1] or [2][4].",
		"If the results do not contain the answer, say so briefly instead of guessing.",
		"Use short paragraphs or bullet lists and plain Markdown. Answer in the language of the query.",
	].join(" ");

	export const AIConfig = z.object({
		enabled: z.boolean(),
		base_url: z
			.string()
			.max(512)
			.describe(
				"OpenAI compatible base URL, e.g. https://api.openai.com/v1 or http://ollama:11434/v1",
			),
		api_key: z.string().max(1024),
		model: z.string().max(256),
		system_prompt: z.string().max(8000),
		temperature: z.number().min(0).max(2),
		max_tokens: z.number().int().min(16).max(32_000),
		context_results: z.number().int().min(1).max(20).describe("How many search results to pass"),
		timeout_ms: z.number().int().min(1000).max(300_000),
		extra_headers: z.record(z.string(), z.string()).describe("Additional request headers"),
	});
	export type AIConfig = z.infer<typeof AIConfig>;

	export const AI_DEFAULTS: AIConfig = {
		enabled: false,
		base_url: "https://api.openai.com/v1",
		api_key: "",
		model: "",
		system_prompt: DEFAULT_AI_SYSTEM_PROMPT,
		temperature: 0.2,
		max_tokens: 1024,
		context_results: 8,
		timeout_ms: 60_000,
		extra_headers: {},
	};

	/** The AI config as returned by the API — the key is never sent back, only whether one is set. */
	export const AIConfigPublic = AIConfig.omit({ api_key: true }).extend({
		api_key_set: z.boolean(),
		default_system_prompt: z.string().describe("The built-in system prompt, for resetting"),
	});
	export type AIConfigPublic = z.infer<typeof AIConfigPublic>;

	// --------------------------------------------------------------------- internal metadata

	export const Secrets = z.object({
		image_proxy_key: z.string().min(32),
	});
	export type Secrets = z.infer<typeof Secrets>;

	export const BangDatasetStatus = z.object({
		updated_at: z.number().nullable(),
		count: z.number(),
		last_error: z.string().nullable(),
		source_url: z.string(),
	});
	export type BangDatasetStatus = z.infer<typeof BangDatasetStatus>;
}
