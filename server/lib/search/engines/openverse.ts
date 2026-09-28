import { z } from "zod";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/**
 * Openly licensed images (Flickr, Wikimedia, museums, …) from the Openverse API.
 *
 * Anonymous access is rate limited per IP (20 requests/minute burst, ~200/day sustained, see the
 * `X-RateLimit-*` headers), capped at 20 results per page and at the first 240 results overall —
 * later pages return nothing without a request. `mature=true` is only sent with safe search off.
 */
export class OpenverseEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "openverse",
		name: "Openverse",
		description: "Openly licensed images from the Openverse catalog (rate limited anonymously).",
		website: "https://openverse.org",
		categories: ["images"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: true, language: false },
		defaultTimeoutMs: 5000,
		defaultRateLimitPerMinute: 10,
	});

	private static readonly PAGE_SIZE = 20;
	/** Anonymous clients only get the first 240 results. */
	private static readonly MAX_RESULTS = 240;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		if (query.page * OpenverseEngine.PAGE_SIZE > OpenverseEngine.MAX_RESULTS) return { results: [] };

		const params = new URLSearchParams({
			q: query.query,
			page: String(query.page),
			page_size: String(OpenverseEngine.PAGE_SIZE),
		});
		if (query.safesearch === 0) params.set("mature", "true");

		const data = await this.http.json<OpenverseEngine.Response>(
			`https://api.openverse.org/v1/images/?${params}`,
			{ headers: { Accept: "application/json" } },
		);
		return { results: OpenverseEngine.parseResults(data), totalResults: data.result_count };
	}

	static parseResults(data: OpenverseEngine.Response): SearchTypes.EngineResult[] {
		if (!Array.isArray(data.results)) throw new EngineError("parse", "Unexpected Openverse response");

		const results: SearchTypes.EngineResult[] = [];
		for (const item of data.results) {
			const image = SearchUtils.safeURL(item.url)?.toString();
			const url = SearchUtils.safeURL(item.foreign_landing_url)?.toString() ?? image;
			if (!url || !image) continue;
			const creator = SearchUtils.cleanText(item.creator);
			const license = OpenverseEngine.license(item.license, item.license_version);
			results.push({
				url,
				title: SearchUtils.cleanText(item.title) || "Untitled",
				content: [creator && `By ${creator}`, license].filter(Boolean).join(" · "),
				template: "image",
				imgSrc: image,
				thumbnail: SearchUtils.safeURL(item.thumbnail)?.toString() ?? image,
				width: item.width || undefined,
				height: item.height || undefined,
				author: creator || undefined,
				source: item.source || item.provider || SearchUtils.hostname(url),
			});
		}
		return results;
	}

	/** `by-sa` + `2.0` → `CC BY-SA 2.0`; `cc0` → `CC0 1.0`; `pdm` → `Public Domain Mark 1.0`. */
	static license(code: string | undefined, version: string | undefined): string {
		if (!code) return "";
		const name =
			code === "pdm" ? "Public Domain Mark" : code === "cc0" ? "CC0" : `CC ${code.toUpperCase()}`;
		return version ? `${name} ${version}` : name;
	}
}

export namespace OpenverseEngine {
	export interface Image {
		title?: string | null;
		url?: string;
		foreign_landing_url?: string;
		thumbnail?: string;
		creator?: string | null;
		license?: string;
		license_version?: string;
		provider?: string;
		source?: string;
		width?: number | null;
		height?: number | null;
	}

	export interface Response {
		result_count?: number;
		results?: Image[];
	}
}
