import { TTLCache } from "../../search/cache";
import { SearchUtils } from "../../search/utils";
import { AppConstants } from "../../utils/constants";
import { InstantAnswerProvider } from "../provider";

/** Word definitions from Wiktionary's REST API. */
export class DefinitionProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "definition",
		name: "Dictionary",
		description: "Definitions of English words (Wiktionary).",
		priority: 60,
		network: true,
		examples: ["define serendipity", "meaning of ephemeral", "ubiquitous definition"],
	});

	private static readonly cache = new TTLCache<any>(512, 24 * 3_600_000);

	private static parseWord(query: string): string | null {
		const q = query.trim().toLowerCase().replace(/\?$/, "");
		const match =
			q.match(/^(?:define|definition of|meaning of|dictionary|dict)\s+([a-z][a-z' -]{0,40})$/) ??
			q.match(/^what\s+does\s+([a-z][a-z' -]{0,40}?)\s+mean$/) ??
			q.match(/^([a-z][a-z' -]{0,40}?)\s+(?:meaning|definition|define)$/);
		return match?.[1]?.trim() ?? null;
	}

	async answer(query: string, ctx: InstantAnswerProvider.Context) {
		const word = DefinitionProvider.parseWord(query);
		if (!word) return null;

		let entries = DefinitionProvider.cache.get(word);
		if (entries === undefined) {
			const res = await ctx.fetch(
				`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, "_"))}`,
				{ headers: { "User-Agent": AppConstants.BOT_USER_AGENT } },
			);
			entries = res.ok ? (((await res.json()) as Record<string, any[]>)?.en ?? null) : null;
			DefinitionProvider.cache.set(word, entries);
		}
		if (!entries?.length) return null;

		const meanings = entries.slice(0, 4).map((entry: any) => ({
			part_of_speech: entry.partOfSpeech as string,
			definitions: (entry.definitions ?? [])
				.map((d: any) => ({
					definition: SearchUtils.stripTags(d.definition),
					example: d.examples?.[0] ? SearchUtils.stripTags(d.examples[0]) : null,
				}))
				.filter((d: { definition: string }) => d.definition)
				.slice(0, 3),
		}));
		const first = meanings[0]?.definitions[0]?.definition;
		if (!first) return null;

		return {
			provider: DefinitionProvider.definition.id,
			type: "definition",
			placement: "top" as const,
			title: word,
			text: `${word} (${meanings[0]!.part_of_speech}): ${first}`,
			data: { word, meanings },
			source: {
				name: "Wiktionary",
				url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
			},
		};
	}
}

/** Knowledge panel with the Wikipedia summary of the queried topic. */
export class WikipediaPanelProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "wikipedia",
		name: "Wikipedia panel",
		description: "Shows a Wikipedia summary next to the results when the query names a topic.",
		priority: 100,
		network: true,
		examples: ["linux kernel", "alan turing", "berlin"],
	});

	private static readonly cache = new TTLCache<any>(1024, 6 * 3_600_000);

	private static normalize(value: string) {
		return value
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/\s*\(.*?\)\s*/g, " ")
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();
	}

	async answer(query: string, ctx: InstantAnswerProvider.Context) {
		const q = query.trim();
		// Topics, not questions or long sentences.
		if (
			q.length < 2 ||
			q.length > 80 ||
			q.split(/\s+/).length > 6 ||
			/[?=+*/^]/.test(q) ||
			/^\d+$/.test(q)
		) {
			return null;
		}

		const lang = SearchUtils.parseLocale(ctx.language).language ?? "en";
		const cacheKey = `${lang}|${WikipediaPanelProvider.normalize(q)}`;
		let summary = WikipediaPanelProvider.cache.get(cacheKey);

		if (summary === undefined) {
			summary = await this.lookup(q, lang, ctx);
			WikipediaPanelProvider.cache.set(cacheKey, summary);
		}
		if (!summary) return null;

		return {
			provider: WikipediaPanelProvider.definition.id,
			type: "wikipedia",
			placement: "side" as const,
			title: summary.title,
			text: summary.extract,
			data: summary,
			source: { name: "Wikipedia", url: summary.url },
		};
	}

	private async lookup(query: string, lang: string, ctx: InstantAnswerProvider.Context) {
		const headers = { "User-Agent": AppConstants.BOT_USER_AGENT };
		const search = await ctx.fetch(
			`https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "opensearch", search: query, limit: "3", namespace: "0", format: "json", redirects: "resolve" })}`,
			{ headers },
		);
		if (!search.ok) return null;
		const [, titles = []] = (await search.json()) as [string, string[]];

		const wanted = WikipediaPanelProvider.normalize(query);
		const title = titles.find((t) => WikipediaPanelProvider.normalize(t) === wanted);
		if (!title) return null;

		const res = await ctx.fetch(
			`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
			{ headers },
		);
		if (!res.ok) return null;
		const page = (await res.json()) as any;
		if (page.type === "disambiguation" || !page.extract) return null;

		return {
			title: page.title as string,
			description: (page.description as string | undefined) ?? null,
			extract: page.extract as string,
			thumbnail: page.thumbnail?.source ?? null,
			url:
				page.content_urls?.desktop?.page ??
				`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
			lang,
		};
	}
}
