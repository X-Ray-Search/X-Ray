import { Logger } from "../utils/logger";
import type { SearchEngine } from "./engines/base";
import { EngineError } from "./errors";
import { EngineHealth } from "./health";
import { type SearchModels, SearchTypes } from "./types";
import { SearchUtils } from "./utils";

/**
 * Runs a set of engines in parallel and merges their answers.
 *
 * Scoring follows SearXNG: every occurrence of a result adds `engine weight / position`, so a
 * page ranked high by several engines wins. Duplicates are detected on a normalized URL (or on
 * the image URL for image results).
 */
export class SearchAggregator {
	static async run(
		query: SearchTypes.EngineQuery,
		engines: readonly SearchEngine[],
	): Promise<SearchAggregator.Outcome> {
		const outcomes = await Promise.all(engines.map((engine) => this.runEngine(engine, query)));

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
		};
	}

	private static async runEngine(engine: SearchEngine, query: SearchTypes.EngineQuery) {
		const { slug, name } = engine.config;
		const base = { slug, name, results: 0, time_ms: 0, error: null };

		if (EngineHealth.isSuspended(slug)) {
			return {
				engine,
				response: null,
				status: { ...base, status: "suspended", error: "Temporarily suspended after being blocked" },
			} satisfies SearchAggregator.EngineOutcome;
		}

		const started = performance.now();
		const controller = new AbortController();
		// Engines may issue several requests (tokens, pagination) — bound the whole call.
		const deadline = setTimeout(() => controller.abort(), engine.config.timeoutMs + 500);

		try {
			const response = await engine.withSignal(controller.signal).search(query);
			const time_ms = Math.round(performance.now() - started);
			EngineHealth.recordSuccess(slug, time_ms);
			return {
				engine,
				response,
				status: { ...base, status: "ok", time_ms, results: response.results.length },
			} satisfies SearchAggregator.EngineOutcome;
		} catch (err) {
			const error = controller.signal.aborted ? new EngineError("timeout", "Engine timed out") : EngineError.from(err);
			const time_ms = Math.round(performance.now() - started);
			EngineHealth.recordFailure(slug, error);
			if (error.kind !== "timeout") Logger.debug(`Engine '${slug}' failed:`, error.message);
			return {
				engine,
				response: null,
				status: {
					...base,
					time_ms,
					status: error.kind === "timeout" ? "timeout" : error.kind === "blocked" ? "blocked" : "error",
					error: error.message,
				},
			} satisfies SearchAggregator.EngineOutcome;
		} finally {
			clearTimeout(deadline);
		}
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
		if ((result.content?.length ?? 0) > (existing.content?.length ?? 0)) existing.content = result.content;
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
	export interface Aggregate extends SearchTypes.EngineResult {
		template: SearchTypes.Template;
		engines: string[];
		positions: number[];
		score: number;
	}

	export interface EngineOutcome {
		engine: SearchEngine;
		response: SearchTypes.EngineResponse | null;
		status: SearchModels.EngineStatus;
	}

	export interface Outcome {
		results: SearchModels.Result[];
		engines: SearchModels.EngineStatus[];
		suggestions: string[];
		corrections: string[];
		totalResults: number;
	}
}
