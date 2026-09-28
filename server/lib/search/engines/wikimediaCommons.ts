import { z } from "zod";
import { AppConstants } from "../../utils/constants";
import { EngineError } from "../errors";
import type { SearchTypes } from "../types";
import { SearchUtils } from "../utils";
import { SearchEngine } from "./base";

const Settings = z.object({});

/**
 * Free media files from Wikimedia Commons via the MediaWiki API (`generator=search` over the
 * File namespace, restricted to `filetype:bitmap|drawing`, with `imageinfo` for URLs and sizes).
 *
 * The generator returns pages keyed by id; the rank is in `index`. Descriptions, authors and
 * licenses come from `extmetadata`, which embeds HTML. Originals browsers can't show (TIFF, XCF…)
 * fall back to the 400px thumbnail. Wikimedia asks API clients to identify themselves, so the
 * bot User-Agent is sent.
 */
export class WikimediaCommonsEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "wikimedia_commons",
		name: "Wikimedia Commons",
		description: "Freely licensed images from Wikimedia Commons (MediaWiki API).",
		website: "https://commons.wikimedia.org",
		categories: ["images"],
		settings: Settings,
		features: { paging: true, timeRange: false, safeSearch: false, language: false },
	});

	private static readonly PAGE_SIZE = 20;
	private static readonly BROWSER_IMAGES = /^image\/(jpeg|png|gif|webp|avif|svg\+xml|bmp)$/;

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const { language } = SearchUtils.parseLocale(query.language);
		const params = new URLSearchParams({
			action: "query",
			format: "json",
			generator: "search",
			gsrnamespace: "6",
			gsrsearch: `${query.query} filetype:bitmap|drawing`,
			gsrlimit: String(WikimediaCommonsEngine.PAGE_SIZE),
			gsroffset: String((query.page - 1) * WikimediaCommonsEngine.PAGE_SIZE),
			prop: "imageinfo",
			iiprop: "url|size|mime|extmetadata",
			iiurlwidth: "400",
			iiextmetadatafilter: "ObjectName|ImageDescription|Artist|LicenseShortName",
			// Only affects which translation of the description is returned.
			iiextmetadatalanguage: language ?? "en",
		});

		const data = await this.http.json<WikimediaCommonsEngine.Response>(
			`https://commons.wikimedia.org/w/api.php?${params}`,
			{ headers: { "User-Agent": AppConstants.BOT_USER_AGENT } },
		);
		if (data.error) {
			throw new EngineError("http", `Commons API error: ${data.error.info ?? data.error.code}`);
		}
		return { results: WikimediaCommonsEngine.parseResults(data) };
	}

	static parseResults(data: WikimediaCommonsEngine.Response): SearchTypes.EngineResult[] {
		// No `query` at all means no hits.
		const pages = Object.values(data.query?.pages ?? {}).sort(
			(a, b) => (a.index ?? 0) - (b.index ?? 0),
		);

		const results: SearchTypes.EngineResult[] = [];
		for (const page of pages) {
			const info = page.imageinfo?.[0];
			if (!info || (info.mime && !info.mime.startsWith("image/"))) continue;
			const original = SearchUtils.safeURL(info.url);
			const thumbnail = SearchUtils.safeURL(info.thumburl);
			const fileName = (page.title ?? "").replace(/^File:/, "");
			const url =
				SearchUtils.safeURL(info.descriptionurl)?.toString() ??
				(fileName &&
					`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`);
			if (!url || !original) continue;

			const meta = (key: string) => SearchUtils.stripTags(info.extmetadata?.[key]?.value);
			const description = SearchUtils.excerpt(meta("ImageDescription"), 200);
			const artist = meta("Artist");
			const displayable = !info.mime || WikimediaCommonsEngine.BROWSER_IMAGES.test(info.mime);

			results.push({
				url,
				title: meta("ObjectName") || fileName.replace(/\.[a-z0-9]+$/i, ""),
				content: [description, artist && `By ${artist}`, meta("LicenseShortName")]
					.filter(Boolean)
					.join(" · "),
				template: "image",
				imgSrc: SearchUtils.cleanURL((displayable ? original : (thumbnail ?? original)).toString()),
				thumbnail: SearchUtils.cleanURL((thumbnail ?? original).toString()),
				width: info.width || undefined,
				height: info.height || undefined,
				author: artist || undefined,
				source: "Wikimedia Commons",
			});
		}
		return results;
	}
}

export namespace WikimediaCommonsEngine {
	export interface Page {
		title?: string;
		index?: number;
		imageinfo?: Array<{
			url?: string;
			thumburl?: string;
			descriptionurl?: string;
			width?: number;
			height?: number;
			mime?: string;
			extmetadata?: Record<string, { value?: string } | undefined>;
		}>;
	}

	export interface Response {
		query?: { pages?: Record<string, Page> };
		error?: { code?: string; info?: string };
	}
}
