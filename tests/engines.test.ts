import { describe, expect, test } from "bun:test";
import { parse } from "node-html-parser";
import { SearchEngineRegistry } from "../server/lib/search/engines";
import { BingCommon } from "../server/lib/search/engines/bing/common";
import { BingImagesEngine, BingNewsEngine } from "../server/lib/search/engines/bing/media";
import { BingEngine } from "../server/lib/search/engines/bing/web";
import { BraveEngine } from "../server/lib/search/engines/brave";
import { DuckDuckGoCommon } from "../server/lib/search/engines/duckduckgo/common";
import { DuckDuckGoEngine } from "../server/lib/search/engines/duckduckgo/web";
import { MojeekEngine } from "../server/lib/search/engines/mojeek";
import { YouTubeEngine } from "../server/lib/search/engines/youtube";
import { SearchUtils } from "../server/lib/search/utils";

// Fixtures are trimmed copies of the markup the engines returned when the parsers were written.

const DDG_HTML = `
<div class="results">
  <div class="result results_links results_links_deep web-result result--ad"><h2 class="result__title"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a></h2></div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://kernel.org">Official &amp; site</a></h2>
    <a class="result__snippet" href="https://kernel.org">Linux   kernel</a>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FLinux_kernel&amp;rut=abc">Linux kernel - Wikipedia</a></h2>
    <a class="result__snippet">The Linux kernel is a free and open-source kernel.</a>
  </div>
</div>
<div class="nav-link">
  <form action="/html/" method="post">
    <input type="submit" class='btn btn--alt' value="Next" />
    <input type="hidden" name="q" value="linux kernel" />
    <input type="hidden" name="s" value="10" />
    <input type="hidden" name="dc" value="12" />
    <input type="hidden" name="vqd" value="4-123" />
  </form>
</div>`;

const BING_HTML = `
<ol id="b_results">
  <li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1aHR0cHM6Ly93d3cua2VybmVsLm9yZy8&amp;ntb=1">The Linux Kernel Archives</a></h2>
    <div class="b_caption"><p class="b_lineclamp2"><span class="news_dt">5 days ago</span>&nbsp;&#0183;&#32;This site is operated by the Linux Kernel Organization.<a class="b_algoReadMore" href="#">Read more</a></p></div></li>
  <li class="b_algo"><h2><a href="https://github.com/torvalds/linux">GitHub - torvalds/linux</a></h2>
    <div class="b_caption"><p>Linux kernel source tree</p></div></li>
</ol>
<span class="sb_count">About 108,000 results</span>`;

const BRAVE_HTML = `
<div class="snippet svelte-x" data-pos="1" data-type="web"><div class="result-content"><a href="https://en.wikipedia.org/wiki/Linux_kernel" class="l1">
  <div class="site-name-content"><cite class="snippet-url">en.wikipedia.org</cite></div>
  <div class="title search-snippet-title" title="Linux kernel - Wikipedia">Linux kernel - Wikipedia</div></a>
  <div class="generic-snippet"><div class="content"><span class="t-secondary">2 days ago -</span> The <strong>Linux</strong> kernel is a free kernel.</div></div></div></div>
<div class="snippet" data-type="video"><a href="https://youtube.com/x">video</a></div>`;

const BING_NEWS_HTML = `
<div class="news-card newsitem cardcommon" url="https://www.phoronix.com/news/a" data-url="https://www.phoronix.com/news/a" data-title="Patches Posted" data-author="Phoronix">
  <div class="image right"><a class="imagelink" href="https://www.phoronix.com/news/a"><img src="/th?id=ONUT.abc&amp;pid=News&amp;w=234"></a></div>
  <div class="caption"><div class="source"><a>Phoronix</a><span tabindex="0" aria-label="5 hours ago"><div class="ns_sc_tm">5h</div></span></div>
  <div class="snippet" title="x">While Linux 7.2 brought initial Apple M3 support...</div></div>
</div>`;

const BING_IMAGES_HTML = `
<ul><li><div class="iuscp"><div class="imgpt"><a class="iusc" m="{&quot;purl&quot;:&quot;https://nyxfault.github.io/posts/k/&quot;,&quot;murl&quot;:&quot;https://www.scaler.com/a.webp&quot;,&quot;turl&quot;:&quot;https://ts4.mm.bing.net/th?id=OIP.x&amp;pid=15.1&quot;,&quot;t&quot;:&quot;Linux Kernel Programming&quot;}"></a>
  <div class="img_info hon"><span class="nowrap">3400&#215;3112</span></div></div></div></li></ul>`;

const YOUTUBE_HTML = `<html><script>var ytInitialData = ${JSON.stringify({
	contents: {
		twoColumnSearchResultsRenderer: {
			primaryContents: {
				sectionListRenderer: {
					contents: [
						{
							itemSectionRenderer: {
								contents: [
									{
										videoRenderer: {
											videoId: "QatE61Ynwrw",
											title: { runs: [{ text: "Getting to Know the Linux Kernel" }] },
											lengthText: { simpleText: "42:46" },
											ownerText: { runs: [{ text: "The Linux Foundation" }] },
											publishedTimeText: { simpleText: "3 years ago" },
											viewCountText: { simpleText: "123,494 views" },
											detailedMetadataSnippets: [{ snippetText: { runs: [{ text: "A beginner's guide" }] } }],
										},
									},
									{ shelfRenderer: {} },
								],
							},
						},
					],
				},
			},
		},
	},
})};</script></html>`;

describe("DuckDuckGo", () => {
	test("parses results, skips ads and unwraps redirect links", () => {
		const results = DuckDuckGoEngine.parseResults(parse(DDG_HTML));
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			url: "https://kernel.org/",
			title: "Official & site",
			content: "Linux kernel",
		});
		expect(results[1]?.url).toBe("https://en.wikipedia.org/wiki/Linux_kernel");
	});

	test("extracts the next-page form", () => {
		expect(DuckDuckGoEngine.parseNextForm(parse(DDG_HTML))).toEqual({
			q: "linux kernel",
			s: "10",
			dc: "12",
			vqd: "4-123",
		});
	});

	test("skips follow-up pages without a cached next form instead of walking pages", async () => {
		let requests = 0;
		const http = { html: async () => (requests++, { root: parse(""), raw: "" }) } as any;
		const engine = new DuckDuckGoEngine(
			{
				id: 1,
				slug: "ddg-test",
				name: "DDG",
				type: "duckduckgo",
				categories: ["general"],
				weight: 1,
				timeoutMs: 1000,
				proxyIds: [],
			},
			{ region: "auto" },
			http,
		);
		const result = await engine.search({
			query: "q",
			category: "general",
			page: 3,
			language: "all",
			safesearch: 1,
			timeRange: null,
		});
		expect(result.results).toEqual([]);
		expect(requests).toBe(0);
	});

	test("maps locales to regions", () => {
		expect(DuckDuckGoCommon.region("all")).toBe("wt-wt");
		expect(DuckDuckGoCommon.region("en")).toBe("us-en");
		expect(DuckDuckGoCommon.region("en-GB")).toBe("uk-en");
		expect(DuckDuckGoCommon.region("de-AT")).toBe("at-de");
		expect(DuckDuckGoCommon.region("de", "ch-de")).toBe("ch-de");
	});
});

describe("Bing", () => {
	test("parses web results and decodes ck/a links", () => {
		const results = BingEngine.parseResults(parse(BING_HTML));
		expect(results).toHaveLength(2);
		expect(results[0]?.url).toBe("https://www.kernel.org/");
		expect(results[0]?.content).toBe("This site is operated by the Linux Kernel Organization.");
		expect(results[0]?.publishedAt).toBeGreaterThan(Date.now() - 6 * 86_400_000);
		expect(results[1]?.url).toBe("https://github.com/torvalds/linux");
	});

	test("only sends a market when one is configured", () => {
		const cookies = BingCommon.cookies(2, "de-DE");
		expect(cookies._EDGE_S).toBe("mkt=de-de&ui=de");
		expect(cookies.SRCHHPGUSR).toBe("ADLT=STRICT");
		// No market by default: Bing follows the exit IP (a mismatch poisons results).
		expect(BingCommon.cookies(0)._EDGE_S).toBeUndefined();
	});

	test("parses news cards", () => {
		const [item] = BingNewsEngine.parseResults(parse(BING_NEWS_HTML));
		expect(item?.url).toBe("https://www.phoronix.com/news/a");
		expect(item?.source).toBe("Phoronix");
		expect(item?.thumbnail).toBe("https://www.bing.com/th?id=ONUT.abc&pid=News&w=234");
		expect(item?.publishedAt).toBeLessThan(Date.now() - 4 * 3_600_000);
	});

	test("parses image metadata", () => {
		const [image] = BingImagesEngine.parseResults(parse(BING_IMAGES_HTML));
		expect(image?.imgSrc).toBe("https://www.scaler.com/a.webp");
		expect(image?.url).toBe("https://nyxfault.github.io/posts/k/");
		expect(image?.width).toBe(3400);
		expect(image?.height).toBe(3112);
	});
});

describe("Brave, Mojeek and YouTube", () => {
	test("Brave web results", () => {
		const [result, ...rest] = BraveEngine.parseResults(parse(BRAVE_HTML));
		expect(rest).toHaveLength(0);
		expect(result?.title).toBe("Linux kernel - Wikipedia");
		expect(result?.content).toBe("The Linux kernel is a free kernel.");
		expect(result?.publishedAt).toBeDefined();
	});

	test("Mojeek results", () => {
		const html = `<ul class="results-standard"><li><a class="title" href="https://example.org/">Example</a><p class="s">Snippet</p></li></ul>`;
		expect(MojeekEngine.parseResults(parse(html))).toEqual([
			{ url: "https://example.org/", title: "Example", content: "Snippet" },
		]);
	});

	test("YouTube initial data", () => {
		const engine = new YouTubeEngine(
			{
				id: 1,
				slug: "yt",
				name: "YouTube",
				type: "youtube",
				categories: ["videos"],
				weight: 1,
				timeoutMs: 1000,
				proxyIds: [],
			},
			{ privacy_embeds: true },
		);
		const [video, ...rest] = engine.parse(YOUTUBE_HTML);
		expect(rest).toHaveLength(0);
		expect(video?.url).toBe("https://www.youtube.com/watch?v=QatE61Ynwrw");
		expect(video?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/QatE61Ynwrw");
		expect(video?.views).toBe(123494);
		expect(video?.duration).toBe("42:46");
	});
});

describe("Registry and utils", () => {
	test("every registered engine has a valid definition", () => {
		const types = SearchEngineRegistry.list().map((cls) => cls.definition);
		expect(types.length).toBeGreaterThanOrEqual(13);
		for (const definition of types) {
			expect(definition.categories.length).toBeGreaterThan(0);
			// Engines that need no configuration must parse empty settings.
			if (!definition.requiresConfiguration)
				expect(definition.settings.safeParse({}).success).toBe(true);
		}
	});

	test("dedupe keys ignore www, trailing slashes and tracking params", () => {
		expect(SearchUtils.dedupeKey("https://www.example.org/a/?utm_source=x")).toBe(
			SearchUtils.dedupeKey("http://example.org/a#top"),
		);
		expect(SearchUtils.cleanURL("https://example.org/?q=1&fbclid=abc")).toBe(
			"https://example.org/?q=1",
		);
	});

	test("relative times and counts", () => {
		const now = Date.parse("2026-09-25T12:00:00Z");
		expect(SearchUtils.parseRelativeTime("5 hours ago", now)).toBe(now - 5 * 3_600_000);
		expect(SearchUtils.parseRelativeTime("3y ago", now)).toBe(now - 3 * 365 * 86_400_000);
		expect(SearchUtils.parseRelativeTime("2 months ago", now)).toBe(now - 60 * 86_400_000);
		expect(SearchUtils.parseCount("1.2M views")).toBe(1_200_000);
	});
});
