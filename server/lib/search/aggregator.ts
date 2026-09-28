import { Logger } from "../utils/logger";
import type { SearchEngine } from "./engines/base";
import { EngineError } from "./errors";
import { EngineHealth } from "./health";
import { EngineRunCache } from "./runCache";
import { EngineThrottle } from "./throttle";
import { type SearchModels, SearchTypes } from "./types";
import { SearchUtils } from "./utils";

/**
 * Runs a set of engines and merges their answers.
 *
 * Engine selection: regular engines always run; *fallback* engines only step in when fewer than
 * `minHealthy` engines would deliver results. Engines already known to be unable to answer
 * (suspended, out of rate limit budget, failed moments ago) are counted up front so their
 * replacements start in the same wave; if more engines fail than expected, the remaining
 * fallbacks run in a second wave.
 *
 * With a cache policy every engine run goes through {@link EngineRunCache}: fresh cached runs
 * skip the network, identical requests already in flight are joined, and an engine that can't
 * answer serves its stale cached results instead of nothing.
 *
 * Scoring follows SearXNG: every occurrence of a result adds `engine weight / position`, so a
 * page ranked high by several engines wins. Duplicates are detected on a normalized URL (or on
 * the image URL for image results).
 */
export class SearchAggregator {
	static async run(
		query: SearchTypes.EngineQuery,
		engines: readonly SearchEngine[],
		options: SearchAggregator.Options = {},
	): Promise<SearchAggregator.Outcome> {
		const context: SearchAggregator.Context = {
			query,
			cache: options.cache && options.cache.freshMs > 0 ? options.cache : null,
			enforceLimits: options.enforceLimits ?? true,
		};

		const regular = engines.filter((e) => !e.config.fallback);
		const reserves = engines.filter((e) => e.config.fallback);
		// Without regular engines the fallbacks are all there is.
		const primary = regular.length ? regular : reserves;
		const standby = regular.length ? reserves : [];
		const target = options.minHealthy ?? 1;

		const plans = new Map(engines.map((engine) => [engine, this.plan(engine, context)]));
		const planOf = (engine: SearchEngine) => plans.get(engine)!;

		const expected = primary.filter((e) => planOf(e).expectHealthy).length;
		const available = standby.filter((e) => planOf(e).expectHealthy);
		const firstWave = [...primary, ...available.splice(0, Math.max(0, target - expected))];

		const outcomes = await Promise.all(
			firstWave.map((engine) => this.runEngine(engine, planOf(engine), context)),
		);
		const healthy = outcomes.filter((o) => o.healthy).length;
		if (healthy < target && available.length) {
			outcomes.push(
				...(await Promise.all(
					available.map((engine) => this.runEngine(engine, planOf(engine), context)),
				)),
			);
		}

		const merged = new Map<string, SearchAggregator.Aggregate>();
		const suggestions = new Set<string>();
		const corrections = new Set<string>();
		let totalResults = 0;

		for (const outcome of outcomes) {
			if (!outcome.response) continue;
			const { engine, response } = outcome;
			for (const suggestion of response.suggestions ?? []) suggestions.add(suggestion);
			for (const correction of response.corrections ?? []) corrections.add(correction);
			totalResults = Math.max(totalResults, response.totalResults ?? 0);

			response.results.forEach((result, index) => {
				this.merge(merged, engine, result, index + 1, query.category);
			});
		}

		const results = [...merged.values()]
			.sort((a, b) => b.score - a.score)
			.map((aggregate) => this.toModel(aggregate, query.category));

		return {
			results,
			engines: outcomes.map((o) => o.status),
			suggestions: [...suggestions].slice(0, 8),
			corrections: [...corrections].slice(0, 3),
			totalResults: Math.max(totalResults, results.length),
			cached: !outcomes.some((o) => o.live) && outcomes.some((o) => o.status.cached !== null),
		};
	}

	/** Look the engine up in the cache and predict whether it will deliver results. */
	private static plan(engine: SearchEngine, context: SearchAggregator.Context) {
		const key = context.cache ? EngineRunCache.key(engine, context.query) : null;
		const lookup = key ? EngineRunCache.lookup(key) : null;
		const { slug, rateLimitPerMinute } = engine.config;
		const expectHealthy = lookup?.fresh
			? true
			: !lookup?.recent &&
				!EngineHealth.isSuspended(slug) &&
				(!context.enforceLimits || EngineThrottle.hasCapacity(slug, rateLimitPerMinute));
		return { key, lookup, expectHealthy } satisfies SearchAggregator.Plan;
	}

	private static async runEngine(
		engine: SearchEngine,
		plan: SearchAggregator.Plan,
		context: SearchAggregator.Context,
	): Promise<SearchAggregator.EngineOutcome> {
		const { slug, name, fallback, rateLimitPerMinute } = engine.config;
		const base = { slug, name, fallback, results: 0, time_ms: 0, error: null, cached: null };
		const { lookup } = plan;
		if (lookup) EngineRunCache.countLookup(!!(lookup.fresh || lookup.recent));

		if (lookup?.fresh) {
			const { response } = lookup.fresh;
			return {
				engine,
				response,
				healthy: true,
				live: false,
				status: { ...base, status: "ok", results: response.results.length, cached: "fresh" },
			};
		}

		if (EngineHealth.isSuspended(slug)) {
			return this.unavailable(
				engine,
				base,
				"suspended",
				"Temporarily suspended after being blocked",
				lookup?.stale ?? null,
			);
		}

		if (lookup?.recent) {
			const { error, response } = lookup.recent;
			if (!error) return this.empty(engine, base, response, lookup.stale, { time_ms: 0, live: false });
			return this.unavailable(engine, base, this.statusOf(error.kind), error.message, lookup.stale);
		}

		const live = async (): Promise<SearchAggregator.LiveResult> => {
			if (!context.enforceLimits) EngineThrottle.record(slug);
			else if (!EngineThrottle.tryAcquire(slug, rateLimitPerMinute)) return { kind: "throttled" };
			return this.fetch(engine, plan.key, context);
		};
		// Identical requests that are already running (another user, the AI answer) are joined.
		const result = plan.key ? await EngineRunCache.coalesce(plan.key, live) : await live();

		if (result.kind === "throttled") {
			const retryIn = Math.ceil(EngineThrottle.retryInMs(slug, rateLimitPerMinute) / 1000);
			return this.unavailable(
				engine,
				base,
				"throttled",
				`Rate limit of ${rateLimitPerMinute} requests per minute reached (next in ${retryIn}s)`,
				lookup?.stale ?? null,
			);
		}
		if (result.kind === "error") {
			return this.unavailable(
				engine,
				base,
				this.statusOf(result.error.kind),
				result.error.message,
				lookup?.stale ?? null,
				{ time_ms: result.time_ms, live: true },
			);
		}
		const { response, time_ms } = result;
		if (!response.results.length) {
			return this.empty(engine, base, response, lookup?.stale ?? null, { time_ms, live: true });
		}
		return {
			engine,
			response,
			healthy: true,
			live: true,
			status: { ...base, status: "ok", time_ms, results: response.results.length },
		};
	}

	/**
	 * An engine that answered without results. Scrapers often do that instead of showing a
	 * captcha, so results it gave for the same query earlier are the better answer.
	 */
	private static empty(
		engine: SearchEngine,
		base: Omit<SearchModels.EngineStatus, "status">,
		response: SearchTypes.EngineResponse | undefined,
		stale: EngineRunCache.Entry | null,
		{ time_ms, live }: { time_ms: number; live: boolean },
	): SearchAggregator.EngineOutcome {
		if (stale) EngineRunCache.countStaleServed();
		return {
			engine,
			response: stale?.response ?? response ?? { results: [] },
			healthy: false,
			live,
			status: {
				...base,
				status: "ok",
				time_ms,
				results: stale?.response.results.length ?? 0,
				cached: stale ? "stale" : live ? null : "fresh",
			},
		};
	}

	/** One live request, bounded by the engine timeout. Updates the health and the cache. */
	private static async fetch(
		engine: SearchEngine,
		key: string | null,
		context: SearchAggregator.Context,
	): Promise<SearchAggregator.LiveResult> {
		const { slug } = engine.config;
		const started = performance.now();
		const controller = new AbortController();
		// Engines may issue several requests (tokens, pagination) — bound the whole call, and
		// don't rely on the engine honouring the abort signal.
		let deadline: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<never>((_, reject) => {
			deadline = setTimeout(() => {
				controller.abort();
				reject(new EngineError("timeout", "Engine timed out"));
			}, engine.config.timeoutMs + 500);
		});

		try {
			const response = await Promise.race([
				engine.withSignal(controller.signal).search(context.query),
				timedOut,
			]);
			const time_ms = Math.round(performance.now() - started);
			EngineHealth.recordSuccess(slug, time_ms);
			if (key && context.cache) EngineRunCache.store(key, slug, response, context.cache);
			return { kind: "ok", response, time_ms };
		} catch (err) {
			const error = controller.signal.aborted
				? new EngineError("timeout", "Engine timed out")
				: EngineError.from(err);
			EngineHealth.recordFailure(slug, error);
			if (key) EngineRunCache.storeFailure(key, slug, error);
			if (error.kind !== "timeout") Logger.debug(`Engine '${slug}' failed:`, error.message);
			return { kind: "error", error, time_ms: Math.round(performance.now() - started) };
		} finally {
			clearTimeout(deadline);
		}
	}

	/** An engine that couldn't answer live — with its stale cached results if there are any. */
	private static unavailable(
		engine: SearchEngine,
		base: Omit<SearchModels.EngineStatus, "status">,
		status: SearchModels.EngineStatus["status"],
		error: string,
		stale: EngineRunCache.Entry | null,
		{ time_ms, live } = { time_ms: 0, live: false },
	): SearchAggregator.EngineOutcome {
		if (stale) EngineRunCache.countStaleServed();
		return {
			engine,
			response: stale?.response ?? null,
			healthy: false,
			live,
			status: {
				...base,
				status,
				time_ms,
				error,
				results: stale?.response.results.length ?? 0,
				cached: stale ? "stale" : null,
			},
		};
	}

	private static statusOf(kind: EngineError.Kind): SearchModels.EngineStatus["status"] {
		return kind === "timeout" ? "timeout" : kind === "blocked" ? "blocked" : "error";
	}

	private static merge(
		merged: Map<string, SearchAggregator.Aggregate>,
		engine: SearchEngine,
		result: SearchTypes.EngineResult,
		position: number,
		category: SearchTypes.Category,
	) {
		const url = SearchUtils.cleanURL(result.url);
		const template = result.template ?? SearchTypes.CategoryInfo[category].template;
		const key =
			template === "image" && result.imgSrc
				? `img:${SearchUtils.dedupeKey(result.imgSrc)}`
				: SearchUtils.dedupeKey(url);
		const points = engine.config.weight / position;

		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, {
				...result,
				url,
				template,
				engines: [engine.config.slug],
				positions: [position],
				score: points,
			});
			return;
		}

		if (!existing.engines.includes(engine.config.slug)) existing.engines.push(engine.config.slug);
		existing.positions.push(position);
		existing.score += points;

		// Keep the richest data from all engines.
		if ((result.content?.length ?? 0) > (existing.content?.length ?? 0))
			existing.content = result.content;
		if (!existing.title && result.title) existing.title = result.title;
		existing.thumbnail ??= result.thumbnail;
		existing.imgSrc ??= result.imgSrc;
		existing.publishedAt ??= result.publishedAt;
		existing.duration ??= result.duration;
		existing.author ??= result.author;
		existing.embedUrl ??= result.embedUrl;
		existing.views ??= result.views;
		existing.width ??= result.width;
		existing.height ??= result.height;
		existing.source ??= result.source;
	}

	private static toModel(
		aggregate: SearchAggregator.Aggregate,
		category: SearchTypes.Category,
	): SearchModels.Result {
		return {
			url: aggregate.url,
			title: aggregate.title || SearchUtils.hostname(aggregate.url),
			content: aggregate.content ?? "",
			template: aggregate.template,
			category,
			engines: aggregate.engines,
			positions: aggregate.positions,
			score: Math.round(aggregate.score * 1000) / 1000,
			published_at: aggregate.publishedAt ?? null,
			thumbnail: aggregate.thumbnail ?? null,
			img_src: aggregate.imgSrc ?? null,
			width: aggregate.width ?? null,
			height: aggregate.height ?? null,
			source: aggregate.source ?? null,
			author: aggregate.author ?? null,
			duration: aggregate.duration ?? null,
			embed_url: aggregate.embedUrl ?? null,
			views: aggregate.views ?? null,
		};
	}
}

export namespace SearchAggregator {
	export interface Options {
		/** Read/write the engine run cache (and join identical in-flight requests). */
		cache?: EngineRunCache.Policy | null;
		/** Fallback engines run while fewer engines than this deliver results. Default 1. */
		minHealthy?: number;
		/** Skip engines that are out of rate limit budget (default). Manual tests pass false. */
		enforceLimits?: boolean;
	}

	export interface Context {
		query: SearchTypes.EngineQuery;
		cache: EngineRunCache.Policy | null;
		enforceLimits: boolean;
	}

	export interface Plan {
		key: string | null;
		lookup: EngineRunCache.Lookup | null;
		/** Whether the engine is expected to deliver results (drives fallback selection). */
		expectHealthy: boolean;
	}

	export type LiveResult =
		| { kind: "ok"; response: SearchTypes.EngineResponse; time_ms: number }
		| { kind: "error"; error: EngineError; time_ms: number }
		| { kind: "throttled" };

	export interface Aggregate extends SearchTypes.EngineResult {
		template: SearchTypes.Template;
		engines: string[];
		positions: number[];
		score: number;
	}

	export interface EngineOutcome {
		engine: SearchEngine;
		response: SearchTypes.EngineResponse | null;
		/** Delivered results of its own right now (fresh or live, not stale). */
		healthy: boolean;
		/** Made (or joined) a network request. */
		live: boolean;
		status: SearchModels.EngineStatus;
	}

	export interface Outcome {
		results: SearchModels.Result[];
		engines: SearchModels.EngineStatus[];
		suggestions: string[];
		corrections: string[];
		totalResults: number;
		/** Everything came from the cache — no engine was asked. */
		cached: boolean;
	}
}
