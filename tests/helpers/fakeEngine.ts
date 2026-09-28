import { eq } from "drizzle-orm";
import { z } from "zod";
import { DB } from "../../server/lib/db";
import { SearchEngineRegistry } from "../../server/lib/search/engines";
import { SearchEngine } from "../../server/lib/search/engines/base";
import { EngineError } from "../../server/lib/search/errors";
import { EngineHealth } from "../../server/lib/search/health";
import { SearchEngineManager } from "../../server/lib/search/manager";
import { SearchService } from "../../server/lib/search/service";
import { EngineThrottle } from "../../server/lib/search/throttle";
import type { SearchTypes } from "../../server/lib/search/types";

const Settings = z.object({
	results: z
		.array(
			z.object({
				url: z.string(),
				title: z.string(),
				content: z.string().optional(),
				imgSrc: z.string().optional(),
				thumbnail: z.string().optional(),
			}),
		)
		.default([]),
	suggestions: z.array(z.string()).default([]),
	delay_ms: z.number().default(0),
	fail: z.enum(["none", "blocked", "error"]).default("none"),
	api_key: z.string().default(""),
});

/** Engine whose behaviour is fully described by its settings — no network. */
export class FakeEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "test_fake",
		name: "Fake engine",
		description: "Test double",
		website: "https://example.org",
		categories: ["general", "images", "news", "videos"],
		settings: Settings,
		secretFields: ["api_key"],
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	/** Every upstream "request", with the slug of the instance that made it. */
	static readonly calls: Array<SearchTypes.EngineQuery & { slug: string }> = [];

	/** Behaviour changes per slug at runtime — unlike settings they keep the cache keys. */
	static readonly overrides = new Map<string, { fail?: "none" | "blocked" | "error" }>();

	static callsOf(slug: string) {
		return FakeEngine.calls.filter((call) => call.slug === slug).length;
	}

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		FakeEngine.calls.push({ ...query, slug: this.config.slug });
		if (this.settings.delay_ms) await Bun.sleep(this.settings.delay_ms);
		const fail = FakeEngine.overrides.get(this.config.slug)?.fail ?? this.settings.fail;
		if (fail === "blocked") throw new EngineError("blocked", "captcha");
		if (fail === "error") throw new EngineError("http", "HTTP 500");
		return {
			results: this.settings.results.map((r) => ({
				...r,
				template: query.category === "images" ? "image" : undefined,
			})),
			suggestions: this.settings.suggestions,
		};
	}
}

export function registerFakeEngine() {
	if (!SearchEngineRegistry.get(FakeEngine.definition.type))
		SearchEngineRegistry.register(FakeEngine);
}

export async function resetEngines() {
	await DB.instance().delete(DB.Tables.searchEngines).run();
	await SearchEngineManager.reload();
	SearchService.clearCache();
}

export async function createFakeEngine(
	slug: string,
	settings: Partial<z.input<typeof Settings>>,
	options: {
		categories?: SearchTypes.Category[];
		weight?: number;
		timeout_ms?: number;
		enabled?: boolean;
		fallback?: boolean;
		rate_limit_per_minute?: number;
	} = {},
) {
	registerFakeEngine();
	FakeEngine.overrides.delete(slug);
	EngineHealth.reset(slug);
	EngineThrottle.reset(slug);
	const row = await DB.instance()
		.insert(DB.Tables.searchEngines)
		.values({
			slug,
			name: slug.toUpperCase(),
			engine_type: FakeEngine.definition.type,
			enabled: options.enabled ?? true,
			categories: options.categories ?? ["general"],
			weight: options.weight ?? 1,
			timeout_ms: options.timeout_ms ?? 2000,
			proxy_ids: [],
			fallback: options.fallback ?? false,
			rate_limit_per_minute: options.rate_limit_per_minute ?? 0,
			settings: Settings.parse(settings),
		})
		.returning()
		.get();
	await SearchEngineManager.reload();
	SearchService.clearCache();
	return row;
}

export async function deleteEngine(slug: string) {
	await DB.instance()
		.delete(DB.Tables.searchEngines)
		.where(eq(DB.Tables.searchEngines.slug, slug))
		.run();
	await SearchEngineManager.reload();
	SearchService.clearCache();
}
