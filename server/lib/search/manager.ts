import { RuntimeMetadata } from "../api/utils/metadata";
import { DB } from "../db";
import { Logger } from "../utils/logger";
import { SearchEngineRegistry } from "./engines";
import type { SearchEngine } from "./engines/base";
import { EngineHealth } from "./health";
import type { SearchTypes } from "./types";

/**
 * Holds the live engine instances built from the `search_engines` table. Reload after any
 * engine change; instances whose type is unknown or whose settings no longer validate are
 * skipped (and reported by `getLoadErrors`).
 */
export class SearchEngineManager {
	private static engines = new Map<string, SearchEngine>();
	private static loadErrors = new Map<string, string>();
	private static loaded = false;
	private static loading: Promise<void> | null = null;

	/** Bump when adding default engines (give them `since: <new version>`). */
	static readonly DEFAULTS_VERSION = 2;

	/** The default engines — the ones that work without any configuration. */
	static readonly DEFAULT_ENGINES: ReadonlyArray<SearchEngineManager.DefaultEngine> = [
		{ slug: "duckduckgo", type: "duckduckgo", name: "DuckDuckGo" },
		{ slug: "bing", type: "bing", name: "Bing" },
		{ slug: "brave", type: "brave", name: "Brave" },
		{ slug: "wikipedia", type: "wikipedia", name: "Wikipedia", weight: 0.8 },
		{ slug: "mojeek", type: "mojeek", name: "Mojeek", enabled: false },
		{ slug: "duckduckgo-images", type: "duckduckgo_images", name: "DuckDuckGo Images" },
		{ slug: "bing-images", type: "bing_images", name: "Bing Images" },
		{ slug: "duckduckgo-news", type: "duckduckgo_news", name: "DuckDuckGo News" },
		{ slug: "bing-news", type: "bing_news", name: "Bing News" },
		{ slug: "duckduckgo-videos", type: "duckduckgo_videos", name: "DuckDuckGo Videos" },
		{ slug: "youtube", type: "youtube", name: "YouTube" },

		// Version 2: Google results as a regular engine, the other scrapers as fallbacks that step
		// in when regular engines are blocked or rate limited. Niche sources start disabled.
		...(
			[
				{ slug: "google-cse", type: "google_cse", name: "Google", categories: ["general"] },
				{ slug: "startpage", type: "startpage", name: "Startpage", fallback: true },
				{ slug: "yahoo", type: "yahoo", name: "Yahoo", fallback: true },
				{ slug: "ecosia", type: "ecosia", name: "Ecosia", fallback: true, enabled: false },
				{ slug: "hackernews", type: "hackernews", name: "Hacker News", enabled: false },
				{ slug: "reddit", type: "reddit", name: "Reddit", enabled: false },
				{ slug: "lemmy", type: "lemmy", name: "Lemmy", weight: 0.8, enabled: false },
				{ slug: "brave-images", type: "brave_images", name: "Brave Images", fallback: true },
				{
					slug: "google-cse-images",
					type: "google_cse",
					name: "Google Images",
					categories: ["images"],
					fallback: true,
				},
				{
					slug: "startpage-images",
					type: "startpage_images",
					name: "Startpage Images",
					weight: 0.8,
					fallback: true,
				},
				{
					slug: "wikimedia-commons",
					type: "wikimedia_commons",
					name: "Wikimedia Commons",
					fallback: true,
				},
				{ slug: "openverse", type: "openverse", name: "Openverse", fallback: true },
				{ slug: "brave-news", type: "brave_news", name: "Brave News", fallback: true },
				{ slug: "yahoo-news", type: "yahoo_news", name: "Yahoo News", weight: 0.9, fallback: true },
				{
					slug: "startpage-news",
					type: "startpage_news",
					name: "Startpage News",
					weight: 0.8,
					fallback: true,
				},
				{ slug: "bing-videos", type: "bing_videos", name: "Bing Videos", fallback: true },
				{ slug: "brave-videos", type: "brave_videos", name: "Brave Videos", fallback: true },
				{
					slug: "startpage-videos",
					type: "startpage_videos",
					name: "Startpage Videos",
					weight: 0.8,
					fallback: true,
				},
				{ slug: "peertube", type: "peertube", name: "PeerTube", weight: 0.8, fallback: true },
				{ slug: "dailymotion", type: "dailymotion", name: "Dailymotion", weight: 0.7, fallback: true },
			] satisfies SearchEngineManager.DefaultEngine[]
		).map((engine) => ({ ...engine, since: 2 })),
	];

	/**
	 * Seed the default engines: all of them into an empty table, otherwise only those added
	 * since this instance was last seeded (existing slugs are skipped, so engines an admin
	 * renamed or deleted don't come back).
	 */
	static async seedDefaults() {
		const existing = await DB.instance()
			.select({ slug: DB.Tables.searchEngines.slug })
			.from(DB.Tables.searchEngines)
			.all();
		// Instances from before versioned seeding got the version 1 set.
		const seededVersion = existing.length
			? ((await RuntimeMetadata.get("engine_defaults")).version ?? 1)
			: 0;
		if (seededVersion >= this.DEFAULTS_VERSION) return;

		const slugs = new Set(existing.map((row) => row.slug));
		const rows = this.DEFAULT_ENGINES.flatMap((engine) => {
			const cls = SearchEngineRegistry.get(engine.type);
			if (!cls || (engine.since ?? 1) <= seededVersion || slugs.has(engine.slug)) return [];
			return [
				{
					slug: engine.slug,
					name: engine.name,
					engine_type: engine.type,
					enabled: engine.enabled ?? true,
					categories: [...(engine.categories ?? cls.definition.categories)],
					weight: engine.weight ?? 1,
					timeout_ms: cls.definition.defaultTimeoutMs ?? 4000,
					proxy_ids: [],
					fallback: engine.fallback ?? false,
					rate_limit_per_minute: cls.definition.defaultRateLimitPerMinute ?? 0,
					settings: cls.definition.settings.parse({}),
				},
			];
		});
		if (rows.length) {
			await DB.instance().insert(DB.Tables.searchEngines).values(rows);
			Logger.info(`Seeded ${rows.length} default search engines.`);
		}
		await RuntimeMetadata.set("engine_defaults", { version: this.DEFAULTS_VERSION });
	}

	static async reload() {
		const rows = await DB.instance().select().from(DB.Tables.searchEngines).all();
		const next = new Map<string, SearchEngine>();
		const errors = new Map<string, string>();

		for (const row of rows) {
			if (!row.enabled) continue;
			try {
				next.set(row.slug, this.instantiate(row));
			} catch (err) {
				errors.set(row.slug, (err as Error).message);
				Logger.warn(`Search engine '${row.slug}' could not be loaded:`, (err as Error).message);
			}
		}

		this.engines = next;
		this.loadErrors = errors;
		this.loaded = true;
	}

	private static async ensureLoaded() {
		if (this.loaded) return;
		this.loading ??= this.reload().finally(() => {
			this.loading = null;
		});
		await this.loading;
	}

	/** Build an engine from a row (also used by the admin "test" endpoint for unsaved configs). */
	static instantiate(
		row: Pick<
			DB.Models.SearchEngine,
			| "id"
			| "slug"
			| "name"
			| "engine_type"
			| "categories"
			| "weight"
			| "timeout_ms"
			| "proxy_ids"
			| "settings"
		> &
			Partial<Pick<DB.Models.SearchEngine, "fallback" | "rate_limit_per_minute">>,
	): SearchEngine {
		const cls = SearchEngineRegistry.get(row.engine_type);
		if (!cls) throw new Error(`Unknown engine type '${row.engine_type}'`);
		const settings = cls.definition.settings.parse(row.settings ?? {});
		const categories = row.categories.filter((c) => cls.definition.categories.includes(c));
		return new cls(
			{
				id: row.id,
				slug: row.slug,
				name: row.name,
				type: row.engine_type,
				categories,
				weight: row.weight,
				timeoutMs: row.timeout_ms,
				proxyIds: row.proxy_ids ?? [],
				fallback: row.fallback ?? false,
				rateLimitPerMinute: row.rate_limit_per_minute ?? 0,
			},
			settings,
		);
	}

	/** Enabled engines serving a category, in configuration order. */
	static async forCategory(category: SearchTypes.Category): Promise<SearchEngine[]> {
		await this.ensureLoaded();
		return [...this.engines.values()].filter((engine) => engine.config.categories.includes(category));
	}

	static async all(): Promise<SearchEngine[]> {
		await this.ensureLoaded();
		return [...this.engines.values()];
	}

	static async get(slug: string) {
		await this.ensureLoaded();
		return this.engines.get(slug);
	}

	static getLoadErrors() {
		return this.loadErrors;
	}

	static healthOf(slug: string) {
		return EngineHealth.snapshot(slug);
	}
}

export namespace SearchEngineManager {
	export interface DefaultEngine {
		slug: string;
		type: string;
		name: string;
		enabled?: boolean;
		weight?: number;
		/** Only queried when too few regular engines answer (see `SearchAggregator`). */
		fallback?: boolean;
		/** Seed with these categories instead of every category the type supports. */
		categories?: readonly SearchTypes.Category[];
		/** The `DEFAULTS_VERSION` that introduced it (default 1). */
		since?: number;
	}
}
