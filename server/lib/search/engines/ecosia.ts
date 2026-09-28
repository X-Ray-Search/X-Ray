import type { HTMLElement } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/**
 * Ecosia web results (Bing-backed). Ecosia sits behind Cloudflare, which answers most
 * server-side requests with a "Just a moment…" JS challenge (HTTP 403, reported as `blocked`) —
 * expect it to work only from residential exit IPs. Pages are 0-based (`p`); the markup is a
 * Svelte app, so results are matched by their `data-test-id`s with class-name fallbacks.
 */
export class EcosiaEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "ecosia",
		name: "Ecosia",
		description: "Web results from Ecosia (Bing-backed). Often blocked by Cloudflare.",
		website: "https://www.ecosia.org",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: false, language: false },
		defaultRateLimitPerMinute: 10,
	});

	private static readonly RESULT_SELECTOR =
		'[data-test-id="mainline-result-web"], article.result, div.result';
	private static readonly SNIPPET_SELECTOR = [
		'[data-test-id="result-snippet"]',
		'[data-test-id="web-result-description"]',
		".result-snippet",
		".result-description",
		".result__description",
		".web-result__description",
	].join(", ");

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const params = new URLSearchParams({ q: query.query });
		if (query.page > 1) params.set("p", String(query.page - 1));

		const { root, raw } = await this.http.html(`https://www.ecosia.org/search?${params}`, {
			language: query.language,
			headers: {
				"Upgrade-Insecure-Requests": "1",
				"Sec-Fetch-Dest": "document",
				"Sec-Fetch-Mode": "navigate",
				"Sec-Fetch-Site": "none",
				"Sec-Fetch-User": "?1",
			},
		});
		if (/<title>\s*Just a moment/i.test(raw) || raw.includes("cf-chl-")) {
			throw new EngineError("blocked", "Ecosia presented a Cloudflare challenge");
		}

		const results = EcosiaEngine.parseResults(root);
		if (!results.length && !raw.includes("mainline")) {
			throw new EngineError("parse", "Ecosia returned an unrecognised page");
		}
		return { results };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		const seen = new Set<string>();
		for (const item of root.querySelectorAll(EcosiaEngine.RESULT_SELECTOR)) {
			const testId = item.getAttribute("data-test-id") ?? "";
			if (/-ad\b/.test(testId) || item.classList.contains("result--ad")) continue;

			const link = EcosiaEngine.titleLink(item);
			const url = SearchUtils.safeURL(link?.getAttribute("href"));
			if (!link || !url || url.hostname.endsWith("ecosia.org")) continue;
			const href = url.toString();
			if (seen.has(href)) continue;

			const title = SearchUtils.cleanText(link.querySelector("h2, h3")?.text ?? link.text);
			if (!title) continue;
			seen.add(href);
			results.push({
				url: href,
				title,
				content: SearchUtils.cleanText(item.querySelector(EcosiaEngine.SNIPPET_SELECTOR)?.text),
			});
		}
		return results;
	}

	/** The link wrapping (or inside) the heading; else the first link that isn't a bare URL. */
	private static titleLink(item: HTMLElement): HTMLElement | null {
		const links = item
			.querySelectorAll("a[href]")
			.filter((a) => /^https?:\/\//i.test(a.getAttribute("href")!));
		return (
			links.find((a) => a.querySelector("h2, h3")) ??
			item.querySelector("h2 a[href], h3 a[href]") ??
			links.find((a) => !EcosiaEngine.looksLikeURL(SearchUtils.cleanText(a.text))) ??
			links[0] ??
			null
		);
	}

	private static looksLikeURL(text: string): boolean {
		return (
			!text ||
			/^https?:\/\//i.test(text) ||
			text.includes("›") ||
			/^[\w-]+(\.[\w-]+)+(\s|\/|$)/.test(text)
		);
	}
}
