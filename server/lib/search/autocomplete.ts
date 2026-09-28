import { ProxyManager } from "../proxy";
import type { SettingsModels } from "../settings/models";
import { AppConstants } from "../utils/constants";
import { Logger } from "../utils/logger";
import { TTLCache } from "./cache";
import { DuckDuckGoCommon } from "./engines/duckduckgo/common";
import { SearchUtils } from "./utils";

type ProviderID = Exclude<(typeof SettingsModels.AutocompleteProviders)[number], "none">;

/**
 * Search-as-you-type suggestions. Every provider answers in (or is mapped to) the OpenSearch
 * suggestions shape `[query, [suggestion, …]]`. Requests go through the default proxies.
 */
export class AutocompleteService {
	private static readonly cache = new TTLCache<string[]>(2000, 10 * 60_000);

	static readonly PROVIDERS: Record<
		ProviderID,
		{ name: string; url: (q: string, locale: string) => string }
	> = {
		duckduckgo: {
			name: "DuckDuckGo",
			url: (q, locale) =>
				`https://duckduckgo.com/ac/?${new URLSearchParams({ q, type: "list", kl: DuckDuckGoCommon.region(locale) })}`,
		},
		google: {
			name: "Google",
			url: (q, locale) =>
				`https://suggestqueries.google.com/complete/search?${new URLSearchParams({ client: "firefox", ie: "utf8", oe: "utf8", hl: SearchUtils.parseLocale(locale).language ?? "en", q })}`,
		},
		brave: {
			name: "Brave",
			url: (q) => `https://search.brave.com/api/suggest?${new URLSearchParams({ q, rich: "false" })}`,
		},
		wikipedia: {
			name: "Wikipedia",
			url: (q, locale) =>
				`https://${SearchUtils.parseLocale(locale).language ?? "en"}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "opensearch", search: q, limit: "8", namespace: "0", format: "json" })}`,
		},
	};

	static async suggest(
		query: string,
		provider: (typeof SettingsModels.AutocompleteProviders)[number],
		locale: string,
	): Promise<string[]> {
		const q = query.trim();
		if (provider === "none" || q.length < 1 || q.length > 200) return [];

		const key = `${provider}|${locale}|${q.toLowerCase()}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		try {
			const res = await ProxyManager.fetch(this.PROVIDERS[provider].url(q, locale), {
				headers: {
					"User-Agent":
						provider === "wikipedia"
							? AppConstants.BOT_USER_AGENT
							: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
					Accept: "application/json",
					"Accept-Language": SearchUtils.acceptLanguage(locale),
				},
				signal: AbortSignal.timeout(2500),
			});
			if (!res.ok) return [];
			const data = (await res.json()) as unknown;
			const suggestions =
				Array.isArray(data) && Array.isArray(data[1])
					? (data[1] as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10)
					: [];
			this.cache.set(key, suggestions);
			return suggestions;
		} catch (err) {
			Logger.debug(`Autocomplete via ${provider} failed:`, (err as Error).message);
			return [];
		}
	}
}
