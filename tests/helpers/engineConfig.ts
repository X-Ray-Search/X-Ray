import type { SearchEngine } from "../../server/lib/search/engines/base";
import type { SearchTypes } from "../../server/lib/search/types";

/** An engine instance config for constructing engines directly in parser tests. */
export function testEngineConfig(
	overrides: Partial<SearchEngine.InstanceConfig> = {},
): SearchEngine.InstanceConfig {
	return {
		id: 1,
		slug: "test",
		name: "Test",
		type: "test",
		categories: ["general"],
		weight: 1,
		timeoutMs: 1000,
		proxyIds: [],
		fallback: false,
		rateLimitPerMinute: 0,
		...overrides,
	};
}

/** A query with the defaults the engines see for a plain first-page search. */
export function testQuery(
	overrides: Partial<SearchTypes.EngineQuery> = {},
): SearchTypes.EngineQuery {
	return {
		query: "linux kernel",
		category: "general",
		page: 1,
		language: "all",
		safesearch: 1,
		timeRange: null,
		...overrides,
	};
}
