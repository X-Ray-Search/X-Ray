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

	/** Engines seeded on first start — the ones that work without any configuration. */
	static readonly DEFAULT_ENGINES: ReadonlyArray<{
		slug: string;
		type: string;
		name: string;
		enabled?: boolean;
		weight?: number;
	}> = [
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
	];

	static async seedDefaultsIfEmpty() {
		const existing = await DB.instance()
			.select({ id: DB.Tables.searchEngines.id })
			.from(DB.Tables.searchEngines)
			.limit(1);
		if (existing.length) return;

		const rows = this.DEFAULT_ENGINES.flatMap((engine) => {
			const cls = SearchEngineRegistry.get(engine.type);
			if (!cls) return [];
			return [
				{
					slug: engine.slug,
					name: engine.name,
					engine_type: engine.type,
					enabled: engine.enabled ?? true,
					categories: [...cls.definition.categories],
					weight: engine.weight ?? 1,
					timeout_ms: cls.definition.defaultTimeoutMs ?? 4000,
					proxy_ids: [],
					settings: cls.definition.settings.parse({}),
				},
			];
		});
		await DB.instance().insert(DB.Tables.searchEngines).values(rows);
		Logger.info(`Seeded ${rows.length} default search engines.`);
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
		>,
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
