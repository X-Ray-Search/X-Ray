import type { z } from "zod";
import { EngineHttp } from "../http";
import type { SearchTypes } from "../types";

/**
 * Base class of every search backend.
 *
 * An engine *type* is a subclass with a static `definition` (built with `SearchEngine.define`);
 * admins create any number of *instances* of a type (rows in `search_engines`), each with its
 * own settings, weight, timeout and proxies. The aggregator calls `search()` on the instances
 * enabled for the requested category.
 *
 * To add an engine: subclass `SearchEngine`, implement `search()`, and register the class in
 * `search/engines/index.ts`. Throw `EngineError` for failures (use `blocked` for captchas).
 */
export abstract class SearchEngine<Settings extends Record<string, any> = Record<string, any>> {
	protected readonly http: EngineHttp;

	constructor(
		readonly config: SearchEngine.InstanceConfig,
		protected readonly settings: Settings,
		http?: EngineHttp,
	) {
		this.http =
			http ??
			new EngineHttp({
				slug: config.slug,
				proxyIds: config.proxyIds,
				timeoutMs: config.timeoutMs,
			});
	}

	abstract search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse>;

	/** Identifies what this instance would answer — cached runs are keyed by it. */
	get cacheFingerprint(): string {
		return `${this.config.type}:${JSON.stringify(this.settings)}`;
	}

	/** Same engine bound to an abort signal — lets the aggregator cancel slow requests. */
	withSignal(signal: AbortSignal): this {
		const Ctor = this.constructor as new (
			config: SearchEngine.InstanceConfig,
			settings: Settings,
			http: EngineHttp,
		) => this;
		return new Ctor(this.config, this.settings, this.http.withSignal(signal));
	}

	static define<S extends z.ZodObject>(definition: SearchEngine.Definition<S>) {
		return definition;
	}
}

export namespace SearchEngine {
	export interface Features {
		/** Supports `page > 1`. */
		paging: boolean;
		timeRange: boolean;
		safeSearch: boolean;
		language: boolean;
	}

	export interface Definition<S extends z.ZodObject = z.ZodObject> {
		/** Registry key stored in `search_engines.engine_type`. */
		readonly type: string;
		readonly name: string;
		readonly description: string;
		readonly website: string;
		readonly categories: readonly SearchTypes.Category[];
		readonly settings: S;
		/** Settings keys that hold secrets (API keys) — never returned by the API. */
		readonly secretFields?: readonly string[];
		readonly features: Features;
		/** Engines that need configuration (API keys, URLs) are not seeded by default. */
		readonly requiresConfiguration?: boolean;
		readonly defaultTimeoutMs?: number;
		/**
		 * Suggested request budget for new instances of scrapers that ban quickly (requests per
		 * minute, 0 = unlimited). Admins can change it per instance.
		 */
		readonly defaultRateLimitPerMinute?: number;
	}

	export interface Class<S extends z.ZodObject = z.ZodObject> {
		new (config: InstanceConfig, settings: z.infer<S>, http?: EngineHttp): SearchEngine;
		readonly definition: Definition<S>;
	}

	/** The per-instance configuration (a `search_engines` row, normalized). */
	export interface InstanceConfig {
		readonly id: number;
		readonly slug: string;
		readonly name: string;
		readonly type: string;
		readonly categories: readonly SearchTypes.Category[];
		readonly weight: number;
		readonly timeoutMs: number;
		readonly proxyIds: readonly number[];
		/** Only queried when too few regular engines answer (see `SearchAggregator`). */
		readonly fallback: boolean;
		/** Upstream requests per minute this instance may make; 0 = unlimited. */
		readonly rateLimitPerMinute: number;
	}
}
