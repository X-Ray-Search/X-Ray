import { BangService } from "../bangs";
import { InstantAnswerService } from "../instant-answers";
import { SettingsHandler } from "../settings";
import type { SettingsModels } from "../settings/models";
import { ConfigHandler } from "../utils/config";
import { SearchAggregator } from "./aggregator";
import { TTLCache } from "./cache";
import { ImageProxy } from "./imageProxy";
import { SearchEngineManager } from "./manager";
import type { SearchModels, SearchTypes } from "./types";

/**
 * The search pipeline: bangs → engine selection → cache → engines + instant answers in
 * parallel → media rewriting. Used by the v1 API, the SearXNG compatible API and AI answers.
 */
export class SearchService {
	private static readonly cache = new TTLCache<SearchService.CachedPage>(1000, 300_000);

	static clearCache() {
		this.cache.clear();
	}

	static pruneCache() {
		this.cache.prune();
	}

	static async search(
		request: SearchService.Request,
		context: SearchService.Context,
	): Promise<SearchModels.Response> {
		const started = performance.now();
		const prefs = context.preferences;
		const rawQuery = request.query.trim();

		let query = rawQuery;
		let category = request.category ?? prefs.default_category;
		let categoryRedirect: SearchTypes.Category | null = null;

		const empty = (overrides: Partial<SearchModels.Response>): SearchModels.Response => ({
			query,
			raw_query: rawQuery,
			category,
			page: request.page ?? 1,
			redirect: null,
			category_redirect: null,
			results: [],
			instant_answers: [],
			suggestions: [],
			corrections: [],
			engines: [],
			number_of_results: 0,
			time_ms: Math.round(performance.now() - started),
			cached: false,
			ai_available: false,
			...overrides,
		});

		if (prefs.bangs_enabled && context.resolveBangs !== false) {
			const bang = await BangService.resolve(rawQuery, {
				userID: context.userID,
				includeDDG: prefs.ddg_bangs_enabled,
			});
			if (bang?.kind === "redirect") {
				return empty({ redirect: { url: bang.url, bang: bang.bang } });
			}
			if (bang?.kind === "category") {
				category = bang.category;
				categoryRedirect = bang.category;
				query = bang.query;
			}
			if (bang?.kind === "lucky") {
				query = bang.query;
				const page = await this.searchPage(
					{ ...request, query, category: "general", page: 1 },
					context,
				);
				const first = page.outcome.results[0];
				if (first) {
					return empty({
						query,
						redirect: {
							url: first.url,
							bang: { trigger: "!", name: "Feeling lucky", source: "internal" },
						},
					});
				}
			}
		}

		if (!query) {
			return empty({ query, category_redirect: categoryRedirect });
		}

		const page = request.page ?? 1;
		const wantInstant =
			prefs.instant_answers_enabled &&
			page === 1 &&
			category === "general" &&
			request.instantAnswers !== false;

		const [pageResult, instantAnswers] = await Promise.all([
			this.searchPage({ ...request, query, category, page }, context),
			wantInstant
				? InstantAnswerService.run(query, {
						disabled: prefs.disabled_instant_answers,
						language: request.language ?? prefs.language,
						units: prefs.units,
						clientIP: context.clientIP,
						userAgent: context.userAgent,
					})
				: Promise.resolve([]),
		]);

		const { outcome, cached } = pageResult;
		const rewrite = prefs.image_proxy && context.imageProxy !== false;
		const results = rewrite ? await ImageProxy.rewriteResults(outcome.results) : outcome.results;
		const answers = rewrite ? await this.rewriteAnswers(instantAnswers) : instantAnswers;

		return {
			query,
			raw_query: rawQuery,
			category,
			page,
			redirect: null,
			category_redirect: categoryRedirect,
			results,
			instant_answers: answers,
			suggestions: outcome.suggestions,
			corrections: outcome.corrections,
			engines: outcome.engines,
			number_of_results: outcome.totalResults,
			time_ms: Math.round(performance.now() - started),
			cached,
			// AI answers are for signed-in users only, also on public instances.
			ai_available:
				context.userID !== null &&
				category === "general" &&
				prefs.ai_mode !== "off" &&
				(await SettingsHandler.isAIAvailable()),
		};
	}

	/** Run (or fetch from cache) the engines for one results page. */
	private static async searchPage(
		request: SearchService.Request & { query: string; category: SearchTypes.Category; page: number },
		context: SearchService.Context,
	): Promise<{ outcome: SearchAggregator.Outcome; cached: boolean }> {
		const prefs = context.preferences;
		let engines = await SearchEngineManager.forCategory(request.category);
		if (request.engines?.length) {
			const wanted = new Set(request.engines.map((e) => e.toLowerCase()));
			engines = engines.filter(
				(e) => wanted.has(e.config.slug) || wanted.has(e.config.name.toLowerCase()),
			);
		} else {
			engines = engines.filter((e) => !prefs.disabled_engines.includes(e.config.slug));
		}

		const engineQuery: SearchTypes.EngineQuery = {
			query: request.query,
			category: request.category,
			page: request.page,
			language: request.language ?? prefs.language,
			safesearch: request.safesearch ?? prefs.safesearch,
			timeRange: request.timeRange ?? null,
		};

		const key = JSON.stringify([
			engineQuery.query.toLowerCase(),
			engineQuery.category,
			engineQuery.page,
			engineQuery.language,
			engineQuery.safesearch,
			engineQuery.timeRange,
			engines.map((e) => e.config.slug).sort(),
		]);
		const hit = this.cache.get(key);
		if (hit) return { outcome: hit.outcome, cached: true };

		const outcome = await SearchAggregator.run(engineQuery, engines);
		// Don't cache pages where every engine failed — the next try may work.
		if (outcome.engines.some((e) => e.status === "ok")) {
			this.cache.set(key, { outcome }, (ConfigHandler.getConfig()?.SEARCH_CACHE_TTL ?? 300) * 1000);
		}
		return { outcome, cached: false };
	}

	private static async rewriteAnswers(answers: SearchModels.InstantAnswer[]) {
		return Promise.all(
			answers.map(async (answer) =>
				typeof answer.data.thumbnail === "string"
					? {
							...answer,
							data: { ...answer.data, thumbnail: await ImageProxy.sign(answer.data.thumbnail) },
						}
					: answer,
			),
		);
	}
}

export namespace SearchService {
	export interface Request {
		query: string;
		category?: SearchTypes.Category;
		page?: number;
		language?: string;
		safesearch?: SearchTypes.SafeSearch;
		timeRange?: SearchTypes.TimeRange | null;
		/** Restrict to these engine slugs (bypasses the user's disabled engines). */
		engines?: string[];
		instantAnswers?: boolean;
	}

	export interface Context {
		userID: number | null;
		preferences: SettingsModels.SearchPreferences;
		clientIP: string | null;
		userAgent: string | null;
		resolveBangs?: boolean;
		/** Set false for API consumers that need the original media URLs. */
		imageProxy?: boolean;
	}

	export interface CachedPage {
		outcome: SearchAggregator.Outcome;
	}
}
