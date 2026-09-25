import type { HTMLElement } from "node-html-parser";
import { z } from "zod";
import { EngineError } from "../../errors";
import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";
import { SearchEngine } from "../base";
import { DuckDuckGoCommon } from "./common";

const Settings = z.object({
	region: z
		.string()
		.default("auto")
		.describe("Force a DuckDuckGo region (`kl`), e.g. `de-de`. `auto` derives it from the language."),
});

/**
 * DuckDuckGo web results via the no-JS endpoint (html.duckduckgo.com). Page 2+ must be
 * requested with the hidden "Next" form of the previous page, so those forms are cached.
 */
export class DuckDuckGoEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "duckduckgo",
		name: "DuckDuckGo",
		description: "Web results from DuckDuckGo (no-JS HTML endpoint).",
		website: "https://duckduckgo.com",
		categories: ["general"],
		settings: Settings,
		features: { paging: true, timeRange: true, safeSearch: true, language: true },
	});

	private static readonly ENDPOINT = "https://html.duckduckgo.com/html/";
	private static readonly nextForms = new Map<string, { form: Record<string, string>; expires: number }>();
	private static readonly FORM_TTL_MS = 20 * 60_000;
	/** Deepest page we walk to when the previous page's form is not cached. */
	private static readonly MAX_PAGE = 5;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (query.page > DuckDuckGoEngine.MAX_PAGE) return { results: [] };
		return this.fetchPage(query, query.page);
	}

	private formKey(query: SearchTypes.EngineQuery, page: number) {
		return [this.config.slug, query.query, query.language, query.safesearch, query.timeRange, page].join("|");
	}

	private async fetchPage(
		query: SearchTypes.EngineQuery,
		page: number,
	): Promise<SearchTypes.EngineResponse> {
		const region = DuckDuckGoCommon.region(query.language, this.settings.region);
		const kp = DuckDuckGoCommon.safeSearch(query.safesearch);

		let form: Record<string, string>;
		if (page === 1) {
			form = { q: query.query, b: "", kl: region, kp, df: DuckDuckGoCommon.timeRange(query.timeRange) };
		} else {
			let cached = DuckDuckGoEngine.nextForms.get(this.formKey(query, page));
			if (!cached || cached.expires < Date.now()) {
				await this.fetchPage(query, page - 1);
				cached = DuckDuckGoEngine.nextForms.get(this.formKey(query, page));
			}
			if (!cached) return { results: [] };
			form = { ...cached.form, kl: region, kp };
		}

		const { root, raw } = await this.http.html(DuckDuckGoEngine.ENDPOINT, {
			form,
			language: query.language,
			cookies: { kl: region, kp },
			headers: { Referer: "https://html.duckduckgo.com/" },
			acceptStatus: [202],
		});

		const results = DuckDuckGoEngine.parseResults(root);
		if (!results.length && (raw.includes("anomaly") || raw.includes("challenge-form"))) {
			throw new EngineError("blocked", "DuckDuckGo presented a bot challenge");
		}

		const next = DuckDuckGoEngine.parseNextForm(root);
		if (next) {
			DuckDuckGoEngine.nextForms.set(this.formKey(query, page + 1), {
				form: next,
				expires: Date.now() + DuckDuckGoEngine.FORM_TTL_MS,
			});
			if (DuckDuckGoEngine.nextForms.size > 1000) {
				const oldest = DuckDuckGoEngine.nextForms.keys().next().value;
				if (oldest !== undefined) DuckDuckGoEngine.nextForms.delete(oldest);
			}
		}

		return { results };
	}

	static parseResults(root: HTMLElement): SearchTypes.EngineResult[] {
		const results: SearchTypes.EngineResult[] = [];
		for (const item of root.querySelectorAll(".result")) {
			if (item.classList.contains("result--ad") || item.querySelector(".badge--ad")) continue;
			const link = item.querySelector("a.result__a");
			const url = DuckDuckGoEngine.resolveLink(link?.getAttribute("href"));
			if (!link || !url) continue;
			results.push({
				url,
				title: SearchUtils.cleanText(link.text),
				content: SearchUtils.cleanText(item.querySelector(".result__snippet")?.text),
			});
		}
		return results;
	}

	/** Unwrap `//duckduckgo.com/l/?uddg=<target>` redirect links. */
	static resolveLink(href: string | undefined): string | null {
		if (!href) return null;
		const url = SearchUtils.safeURL(href, "https://duckduckgo.com");
		if (!url) return null;
		if (url.hostname.endsWith("duckduckgo.com") && url.pathname.startsWith("/l/")) {
			return SearchUtils.safeURL(url.searchParams.get("uddg"))?.toString() ?? null;
		}
		if (url.hostname.endsWith("duckduckgo.com") && url.pathname.startsWith("/y.js")) return null;
		return url.toString();
	}

	static parseNextForm(root: HTMLElement): Record<string, string> | null {
		for (const form of root.querySelectorAll(".nav-link form")) {
			const submit = form.querySelector('input[type="submit"]');
			if (submit?.getAttribute("value")?.toLowerCase() !== "next") continue;
			const values: Record<string, string> = {};
			for (const input of form.querySelectorAll('input[type="hidden"]')) {
				const name = input.getAttribute("name");
				if (name) values[name] = input.getAttribute("value") ?? "";
			}
			return values;
		}
		return null;
	}
}
