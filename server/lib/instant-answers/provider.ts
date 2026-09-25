import type { SearchModels } from "../search/types";

/**
 * Base class of every instant answer ("smart answer") provider — the calculator, unit and
 * currency conversion, time, weather, definitions, the Wikipedia panel, generators, …
 *
 * `answer()` returns `null` when the query is not for this provider. Keep the matching cheap
 * (regexes) and only do network requests after a match; use `ctx.fetch` so requests go through
 * the instance's proxies.
 *
 * To add a provider: subclass, set a static `definition`, implement `answer()`, and register the
 * class in `instant-answers/index.ts`. The frontend renders known `type`s with dedicated widgets
 * and falls back to `title` + `text` for anything else.
 */
export abstract class InstantAnswerProvider {
	abstract answer(
		query: string,
		ctx: InstantAnswerProvider.Context,
	): Promise<SearchModels.InstantAnswer | null> | SearchModels.InstantAnswer | null;

	static define(definition: InstantAnswerProvider.Definition) {
		return definition;
	}
}

export namespace InstantAnswerProvider {
	export interface Definition {
		readonly id: string;
		readonly name: string;
		readonly description: string;
		/** Lower runs first and is shown first. */
		readonly priority: number;
		/** Whether the provider calls external services. */
		readonly network: boolean;
		/** Example queries shown in the settings UI. */
		readonly examples: readonly string[];
	}

	export interface Class {
		new (): InstantAnswerProvider;
		readonly definition: Definition;
	}

	export interface Context {
		/** Locale of the search (`all`, `en`, `de-DE`, …). */
		readonly language: string;
		readonly units: "metric" | "imperial";
		readonly clientIP: string | null;
		readonly userAgent: string | null;
		readonly now: Date;
		/** Proxied fetch with a short timeout. */
		fetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response>;
	}
}
