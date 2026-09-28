import { describe, expect, test } from "bun:test";
import { parse } from "node-html-parser";
import { EcosiaEngine } from "../server/lib/search/engines/ecosia";
import { GoogleCSEEngine } from "../server/lib/search/engines/googleCse";
import { YahooCommon, YahooEngine, YahooNewsEngine } from "../server/lib/search/engines/yahoo";
import { EngineError } from "../server/lib/search/errors";
import { testEngineConfig, testQuery } from "./helpers/engineConfig";

// Fixtures are trimmed copies of what the services returned when the parsers were written
// (Ecosia's is modelled on its known markup — Cloudflare blocked every capture attempt).

const CSE_SCRIPT = `(function(opts_){/* Copyright The Closure Library Authors. */'use strict';var f=this||self;})({
  "cx": "partner-pub-8993703457585266:4862972284",
  "language": "en",
  "cse_token": "AHbIdTibQUvgCPtVPv2JawI-kADX:1790603871135",
  "isHostedPage": false,
  "exp": ["cc", "sps", "esbfa"],
  "cselibVersion": "3735a6ee3000c0cb",
  "usqp": "CAM\\u003d"
});`;

const jsonp = (data: unknown) => `/*O_o*/\n_(${JSON.stringify(data, null, 2)});`;

const CSE_WEB = jsonp({
	cursor: { currentPageIndex: 0, estimatedResultCount: "28700000", resultCount: "28,700,000" },
	spelling: {
		type: "SPELL_CORRECTED_RESULTS",
		correctedAnchor: "linux <b><i>kernel</i></b>",
		correctedQuery: "linux kernel",
		originalQuery: "linux kernl",
	},
	results: [
		{
			titleNoFormatting: "The Linux Kernel Archives",
			contentNoFormatting:
				"The Linux Kernel Archives ; mainline: 7.3-rc5, 2026-09-27, [tarball] ; stable: 7.2.8, 2026-09-25, [tarball], [pgp] ; stable: 7.1.13 [EOL], 2026-09-02, [tarball], [ ...",
			unescapedUrl: "https://www.kernel.org/",
			visibleUrl: "www.kernel.org",
		},
		{
			titleNoFormatting: "What is the Linux kernel? - Red Hat",
			contentNoFormatting:
				"27 Feb 2019 ... Overview. The Linux® kernel is the main component of a Linux operating system (OS) and is the core interface between a computer's hardware and ...",
			unescapedUrl: "https://www.redhat.com/en/topics/linux/what-is-the-linux-kernel",
			visibleUrl: "www.redhat.com",
		},
		{
			titleNoFormatting: "The Linux Kernel documentation",
			contentNoFormatting:
				"Kernel documentation, like the kernel itself, is very much a work in progress; that is especially true as we work to integrate our many scattered documents into ...",
			unescapedUrl: "https://docs.kernel.org/",
			visibleUrl: "docs.kernel.org",
			richSnippet: {
				cseThumbnail: {
					src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTgFNsEIGq8QbgRVqYpkdw3uVevHbuCqbRtNi05hlYv6bIOLSEQ68X3-mg&s",
					width: "203",
					height: "248",
				},
			},
		},
		{ titleNoFormatting: "No URL" },
	],
	findMoreOnGoogle: { url: "https://www.google.com/search?client=ms-google-coop&q=linux+kernl" },
});

const CSE_IMAGES = jsonp({
	cursor: { currentPageIndex: 0, estimatedResultCount: "166000000" },
	context: { title: "Search" },
	results: [
		{
			titleNoFormatting: "Demystifying the Linux Kernel: Diagram & Core – Digilent Blog",
			unescapedUrl:
				"https://digilent.com/blog/wp-content/uploads/2015/05/1280px-Kernel_Layout.svg_.png",
			originalContextUrl: "https://digilent.com/blog/demystifiying-the-linux-kernel/",
			visibleUrl: "digilent.com",
			tbUrl:
				"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSzLsLDmuq90Ox6qU6euVTHYDhqAkelKAKCKOALatM1pvK4UPZMUyOg3g&s",
			width: "1280",
			height: "1012",
		},
		{
			titleNoFormatting: "How I Made My Linux Kernel Panic | Ettore Ciarcia",
			unescapedUrl: "https://ettoreciarcia.com/publication/27-kernel-dump/featured.webp",
			originalContextUrl: "https://ettoreciarcia.com/publication/27-kernel-dump/",
			visibleUrl: "ettoreciarcia.com",
		},
	],
});

const YAHOO_HTML = `
<ol class="reg searchTop"><li class="first last"><div class="dd fst lst assist mb-36 mt-0 bd-0 p-0 Sugg"><div class="compTitle"><h3 class="title"><span class="fc-obsidian">Including results for </span></h3> <span class="stxt "><a class="fc-denim" referrerpolicy="unsafe-url" href="https://search.yahoo.com/search;_ylt=A2RSdGgSc7pq4wIAEKhXNyoA;_ylu=Y29sbwNldS13ZXN0LTEEcG9zAzEEdnRpZAMEc2VjA3Fydw--?ei=UTF-8&amp;p=linux+kernel&amp;fr2=12642">linux <strong><i>kernel</i></strong></a></span></div><div class="compText"><div class="lh-20"><span class="fc-obsidian">Search only for </span> <a class="fc-denim" href="https://search.yahoo.com/search;_ylt=A2RSdGgSc7pq4wIAEahXNyoA?ei=UTF-8&amp;p=linux+kernl&amp;norw=1">linux kernl</a></div></div></div></li></ol>
<div id="web"><ol class="reg searchCenterMiddle">
<li class="first"><div class="dd fst algo algo-sr relsrch richAlgo"><div class="compTitle options-toggle"><a class="d-ib va-top mt-38 mb-4 mxw-100p" target="_blank" referrerpolicy="origin" href="https://r.search.yahoo.com/_ylt=A2RSdGgSc7pq4wIAEqhXNyoA;_ylu=Y29sbwNldS13ZXN0LTEEcG9zAzEEdnRpZAMEc2VjA3Ny/RV=2/RE=1791813651/RO=10/RU=https%3a%2f%2fwww.kernel.org%2f/RK=2/RS=7Dp9.JpeKqhHDwMRRyNEsBS5xUo-"><div  class="d-ib p-abs t-0 l-0 fz-13 lh-16 fc-dustygray wr-bw ls-n fw-m"><div class="thmb algo-favicon"><img class="s-img" width="16" height="16" alt="" src="https://s.yimg.com/pv/static/img/yahoo_favicon_fallback-202403130023.svg"></div><span style="letter-spacing: 0.195px;" class="d-ib va-mid"><span class="fc-141414 d-b">The Linux Kernel Archives</span>https://www.kernel.org</span></div><h3 style="display:block" class="title fc-2015C2-imp pt-6 ivmt-6 mxw-100p"><span class="d-b fz-20 lh-24 tc ls-024 fw-500">The Linux Kernel Archives</span></h3></a></div><div class="compText aAbs"><p class="fc-dustygray fz-14 lh-22 ls-02 mah-44 ov-h d-box fbox-ov fbox-lc2"><span class="fc-smoke">Sep 20, 2026 · </span>  This site is operated by the Linux <b>Kernel</b> Organization, a 501 (c)3 nonprofit corporation. </p></div><div class="compList d-f g-16 ptb-10 ivmb-8 td-hn ov-h w-616 alternative-links" ><ul class="fl-l w-300"><li class="pl-8 ptb-12 pr-32 bb-1-E0E4E9"><a class="algo-sitelink-title" href="https://r.search.yahoo.com/_ylt=A2RSdGgSc7pq4wIAGahXNyoA/RV=2/RE=1791813651/RO=10/RU=https%3a%2f%2fwww.kernel.org%2fcategory%2freleases.html/RK=2/RS=LyqE2bjK7hJvAR_ExVxvIsRaUho-">Releases</a></li></ul></div></div></li>
<li><div class="dd algo algo-sr relsrch Sr"><div class="compTitle options-toggle"><a class="d-ib va-top mt-38 mb-4 mxw-100p" target="_blank" referrerpolicy="origin" href="https://r.search.yahoo.com/_ylt=A2RSdGgSc7pq4wIAMqhXNyoA;_ylu=Y29sbwNldS13ZXN0LTEEcG9zAzIEdnRpZAMEc2VjA3Ny/RV=2/RE=1791813651/RO=10/RU=https%3a%2f%2fgithub.com%2ftorvalds%2flinux/RK=2/RS=CMokWYrHehm1wDR6o1XBNe0WgSI-"><div  class="d-ib p-abs t-0 l-0 fz-13 lh-16 fc-dustygray wr-bw ls-n fw-m"><span style="letter-spacing: 0.195px;" class="d-ib va-mid"><span class="fc-141414 d-b">Github</span>https://github.com › torvalds › linux</span></div><h3 style="display:block" class="title fc-2015C2-imp pt-6 ivmt-6 mxw-100p"><span class="d-b fz-20 lh-24 tc ls-024 fw-500">GitHub - torvalds/linux: Linux kernel source tree &middot; GitHub</span></h3></a></div><div class="compText aAbs"><p class="fc-dustygray fz-14 lh-22 ls-02 mah-44 ov-h d-box fbox-ov fbox-lc2"> Linux <b>kernel</b> source tree. </p></div></div></li>
<li class="last"><div class="dd lst algo algo-sr relsrch Sr"><div class="compTitle options-toggle"><a href="https://r.search.yahoo.com/_ylt=A2RSdGgSc7pq4wIAN6hXNyoA/RV=2/RE=1791813651/RO=10/RK=2/RS=x-"><h3 class="title"><span>Broken redirect</span></h3></a></div></div></li>
</ol>
<ol class="reg searchCenterFooter"><li><div class="dd AlsoTry"><div class="compTitle"><h2 class="title"><span>Searches related to linux kernl</span></h2></div><table class="compTable mt-6 mb-0 td-n"><tbody><tr class="d-box pb-8"><td class="at-item"><a href="https://search.yahoo.com/search;_ylt=A2RSdGgSc7pq4wIAOKhXNyoA?ei=UTF-8&amp;p=linux+kernel&amp;fr2=p%3As"><span class="d-box fbox-ov fbox-lc2 wrap ov-h" title="linux kernel"><span class=''></span>linux kernel</span></a></td><td class="at-item"><a href="https://search.yahoo.com/search;_ylt=A2RSdGgSc7pq4wIAPKhXNyoA?ei=UTF-8&amp;p=linux+kernel+version"><span title="linux kernel version"><span class=''></span>linux <b>kernel version</b></span></a></td></tr></tbody></table></div></li></ol>
</div>`;

const YAHOO_NEWS_HTML = `
<div id="web"><ol class="reg searchCenterMiddle">
<li class="first"><div class="dd hometown NewsArticle"><ul class="compArticleList"><li class="ov-a fst lst"><a class="thmb" referrerpolicy="unsafe-url" href="https://r.search.yahoo.com/_ylt=A2RSjGisc7pq1wIARXXQtDMD;_ylu=Y29sbwNldS13ZXN0LTEEcG9zAzEEdnRpZAMEc2VjA3Ny/RV=2/RE=1791813805/RO=10/RU=https%3a%2f%2ftech.yahoo.com%2fcomputing%2farticles%2flinux-enthusiasts-see-10-second-122000351.html/RK=2/RS=l4sxCbrTZaCHja8ULuU8pGktvOw-" target="_blank" title="Linux enthusiasts see 10-second kernel compilation times on the horizon"><img class="s-img bdr-12 mb-4" width="160" height="106" alt="" src="https://s.yimg.com/fz/api/res/1.2/aS8.8Ud880m9tpxp6NoEsw--~C/YXBwaWQ9c3JjaGRk/https://media.zenfs.com/en/toms_hardware_319/ceb0fea577c76bfdf15d7782ff09cf37.jpg"></a><div class="vert-source d-f j-l ai-c"><div class="thmb"><img class="s-img" width="20" height="20" src="https://s.yimg.com/pv/static/search_favicon/images/40x40_98938a50c9eb0339.png"></div><span class="s-source fw-l">Tom's Hardware<span class="s-via fc-dustygray fw-m"> &middot;  via Yahoo Tech</span></span></div><h4 class="s-title fz-20 lh-m fw-500 ls-027 mt-6 mb-2"><a target="_blank" referrerpolicy="unsafe-url" href="https://r.search.yahoo.com/_ylt=A2RSjGisc7pq1wIARHXQtDMD;_ylu=Y29sbwNldS13ZXN0LTEEcG9zAzEEdnRpZAMEc2VjA3Ny/RV=2/RE=1791813805/RO=10/RU=https%3a%2f%2ftech.yahoo.com%2fcomputing%2farticles%2flinux-enthusiasts-see-10-second-122000351.html/RK=2/RS=l4sxCbrTZaCHja8ULuU8pGktvOw-">Linux enthusiasts see 10-second kernel compilation times on the ho...</a></h4><span class="s-time fz-14 lh-18 fc-dustygray fl-l mr-4">1 day ago &middot; </span><p class="s-desc fz-14 lh-1_45x fc-444444">It won&rsquo;t be long until <b>Linux</b> enthusiasts will be able to complete a clean <b>kernel</b> build in under 10 s...</p></li></ul></div></li>
<li><div class="dd hometown NewsArticle"><ul class="compArticleList"><li class="ov-a fst lst"><div class="vert-source d-f j-l ai-c"><div class="thmb"><img class="s-img" width="20" height="20" src="https://s.yimg.com/pv/static/search_favicon/images/32x32_8c8.png"></div><span class="s-source fw-l">Forkast News<span class="s-via fc-dustygray fw-m"> &middot;  via Yahoo Tech</span></span></div><h4 class="s-title"><a href="https://r.search.yahoo.com/_ylt=A2RSjGisc7pq1wIAaHXQtDMD/RV=2/RE=1791813805/RO=10/RU=https%3a%2f%2ftech.yahoo.com%2fcybersecurity%2farticles%2fmuse-undocumented-endpoint-192808424.html/RK=2/RS=abc-">Muse&rsquo;s Undocumented Endpoint Turns macOS Agent Into a Local Backdoor</a></h4><span class="s-time">Sep 22, 2026 &middot; </span><p class="s-desc">The Agent as an Attack Surface</p></li></ul></div></li>
</ol></div>`;

const ECOSIA_HTML = `
<main class="mainline"><div class="mainline__result-wrapper">
  <article class="result web-result mainline__result" data-test-id="mainline-result-ad"><a href="https://www.ecosia.org/ads/click?x=1"><h2>Sponsored</h2></a></article>
  <article class="result web-result mainline__result" data-test-id="mainline-result-web">
    <div class="result__header"><a class="result__source--domain" href="https://www.kernel.org/">www.kernel.org</a></div>
    <div class="result__body"><div class="result__title"><a class="result__link" data-test-id="result-link" href="https://www.kernel.org/"><h2 class="result-title__heading" data-test-id="result-title">The Linux Kernel Archives</h2></a></div>
    <div class="result__description" data-test-id="web-result-description"><p class="web-result__description">This site is operated by the Linux  Kernel Organization.</p></div></div>
  </article>
  <article class="result web-result mainline__result" data-test-id="mainline-result-web">
    <div class="result__header"><a href="https://en.wikipedia.org/wiki/Linux_kernel">en.wikipedia.org › wiki</a></div>
    <div class="result__title"><a href="https://en.wikipedia.org/wiki/Linux_kernel">Linux kernel - Wikipedia</a></div>
    <div class="result-snippet">The Linux kernel is a free and open-source kernel.</div>
  </article>
  <article class="result" data-test-id="mainline-result-web"><a href="https://www.ecosia.org/images?q=linux"><h2>Images</h2></a></article>
</div></main>`;

function cseEngine(cx: string, http: any) {
	return new GoogleCSEEngine(
		testEngineConfig({ slug: `cse-${cx}`, type: "google_cse", categories: ["general", "images"] }),
		{ cx },
		http,
	);
}

/** Fake EngineHttp for the CSE token + search flow: answers `cse.js` and `element/v1` calls. */
function fakeCSEHttp(bodies: string[]) {
	const urls: URL[] = [];
	return {
		urls,
		http: {
			text: async (url: string) => {
				urls.push(new URL(url));
				return url.includes("/cse.js") ? CSE_SCRIPT : (bodies.shift() ?? CSE_WEB);
			},
		} as any,
	};
}

describe("Google CSE", () => {
	test("extracts the element token from cse.js", () => {
		expect(GoogleCSEEngine.parseToken(CSE_SCRIPT)).toEqual({
			token: "AHbIdTibQUvgCPtVPv2JawI-kADX:1790603871135",
			libVersion: "3735a6ee3000c0cb",
			exp: "cc,sps,esbfa",
		});
		expect(GoogleCSEEngine.parseToken("<html>Not found</html>")).toBeNull();
	});

	test("parses web results, splits dated snippets and reads the spelling correction", async () => {
		const { http, urls } = fakeCSEHttp([CSE_WEB]);
		const response = await cseEngine("web-test", http).search(
			testQuery({ query: "linux kernl", language: "en-US", safesearch: 1 }),
		);

		expect(urls.map((url) => url.pathname)).toEqual(["/cse/cse.js", "/cse/element/v1"]);
		expect(urls[0]?.searchParams.get("cx")).toBe("web-test");
		const params = urls[1]!.searchParams;
		expect(params.get("cse_tok")).toBe("AHbIdTibQUvgCPtVPv2JawI-kADX:1790603871135");
		expect(params.get("cselibv")).toBe("3735a6ee3000c0cb");
		expect(params.get("exp")).toBe("cc,sps,esbfa");
		expect(params.get("q")).toBe("linux kernl");
		expect(params.get("safe")).toBe("medium");
		expect(params.get("searchtype")).toBe("");
		expect(params.get("hl")).toBe("en");
		expect(params.get("lr")).toBe("lang_en");
		expect(params.get("gl")).toBe("us");
		expect(params.has("start")).toBe(false);

		expect(response.results).toHaveLength(3);
		expect(response.results[0]).toEqual({
			url: "https://www.kernel.org/",
			title: "The Linux Kernel Archives",
			content:
				"The Linux Kernel Archives ; mainline: 7.3-rc5, 2026-09-27, [tarball] ; stable: 7.2.8, 2026-09-25, [tarball], [pgp] ; stable: 7.1.13 [EOL], 2026-09-02, [tarball], [ ...",
			publishedAt: undefined,
			thumbnail: undefined,
		});
		expect(response.results[1]?.content).toStartWith("Overview. The Linux® kernel");
		expect(new Date(response.results[1]!.publishedAt!).getFullYear()).toBe(2019);
		expect(response.results[2]?.thumbnail).toStartWith("https://encrypted-tbn0.gstatic.com/");
		expect(response.corrections).toEqual(["linux kernel"]);
		expect(response.totalResults).toBe(28_700_000);
	});

	test("maps image results and the images category", async () => {
		const { http, urls } = fakeCSEHttp([CSE_IMAGES]);
		const response = await cseEngine("image-test", http).search(
			testQuery({ category: "images", page: 2, safesearch: 0, timeRange: "week" }),
		);
		const params = urls[1]!.searchParams;
		expect(params.get("searchtype")).toBe("image");
		expect(params.get("start")).toBe("20");
		expect(params.get("safe")).toBe("off");
		expect(params.get("sort")).toMatch(/^date:r:\d{8}:\d{8}$/);
		expect(params.has("lr")).toBe(false);

		expect(response.results).toEqual([
			{
				url: "https://digilent.com/blog/demystifiying-the-linux-kernel/",
				title: "Demystifying the Linux Kernel: Diagram & Core – Digilent Blog",
				template: "image",
				imgSrc: "https://digilent.com/blog/wp-content/uploads/2015/05/1280px-Kernel_Layout.svg_.png",
				thumbnail:
					"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSzLsLDmuq90Ox6qU6euVTHYDhqAkelKAKCKOALatM1pvK4UPZMUyOg3g&s",
				width: 1280,
				height: 1012,
				source: "digilent.com",
			},
			{
				url: "https://ettoreciarcia.com/publication/27-kernel-dump/",
				title: "How I Made My Linux Kernel Panic | Ettore Ciarcia",
				template: "image",
				imgSrc: "https://ettoreciarcia.com/publication/27-kernel-dump/featured.webp",
				thumbnail: "https://ettoreciarcia.com/publication/27-kernel-dump/featured.webp",
				width: undefined,
				height: undefined,
				source: "ettoreciarcia.com",
			},
		]);
	});

	test("caches the token per cx", async () => {
		const { http, urls } = fakeCSEHttp([CSE_WEB, CSE_WEB]);
		const engine = cseEngine("cache-test", http);
		await engine.search(testQuery());
		await engine.search(testQuery({ page: 2 }));
		expect(urls.map((url) => url.pathname)).toEqual([
			"/cse/cse.js",
			"/cse/element/v1",
			"/cse/element/v1",
		]);
	});

	test("reports 429 errors as blocked and drops the token", async () => {
		const limited = jsonp({ error: { code: 429, message: "Rate limit exceeded" } });
		const { http, urls } = fakeCSEHttp([limited, CSE_WEB]);
		const engine = cseEngine("limit-test", http);
		const error = await engine.search(testQuery()).catch((err) => err);
		expect(error).toBeInstanceOf(EngineError);
		expect(error.kind).toBe("blocked");

		await engine.search(testQuery());
		expect(urls.filter((url) => url.pathname === "/cse/cse.js")).toHaveLength(2);
	});

	test("retries once with a fresh token when a cached one is rejected", async () => {
		const rejected = jsonp({ error: { code: 403, message: "Invalid token" } });
		const { http, urls } = fakeCSEHttp([CSE_WEB, rejected, CSE_WEB]);
		const engine = cseEngine("retry-test", http);
		await engine.search(testQuery());
		const response = await engine.search(testQuery());
		expect(response.results).toHaveLength(3);
		expect(urls.map((url) => url.pathname)).toEqual([
			"/cse/cse.js",
			"/cse/element/v1",
			"/cse/element/v1",
			"/cse/cse.js",
			"/cse/element/v1",
		]);
	});

	test("stops after the 100-result cap without requests", async () => {
		const { http, urls } = fakeCSEHttp([]);
		expect((await cseEngine("cap-test", http).search(testQuery({ page: 6 }))).results).toEqual([]);
		expect(urls).toHaveLength(0);
	});

	test("rejects an unreadable response", async () => {
		const { http } = fakeCSEHttp(["<html>error</html>"]);
		const error = await cseEngine("parse-test", http)
			.search(testQuery())
			.catch((err) => err);
		expect(error.kind).toBe("parse");
	});

	test("builds date restrictions", () => {
		const now = Date.UTC(2026, 8, 28, 12);
		expect(GoogleCSEEngine.dateRestrict("day", now)).toBe("date:r:20260927:20260928");
		expect(GoogleCSEEngine.dateRestrict("year", now)).toBe("date:r:20250928:20260928");
		expect(GoogleCSEEngine.dateRestrict(null, now)).toBeNull();
	});

	test("splits only real dates off snippets", () => {
		const now = Date.UTC(2026, 8, 28);
		expect(GoogleCSEEngine.splitDate("3 days ago ... Text", now)).toEqual({
			content: "Text",
			publishedAt: now - 3 * 86_400_000,
		});
		expect(GoogleCSEEngine.splitDate("Feb 27, 2019 ... Text").publishedAt).toBeNumber();
		expect(GoogleCSEEngine.splitDate("Linux (Kernel) ... Linux ist")).toEqual({
			content: "Linux (Kernel) ... Linux ist",
		});
		expect(GoogleCSEEngine.splitDate("Top 5 months ... list")).toEqual({
			content: "Top 5 months ... list",
		});
	});

	test("has a default cx", () => {
		expect(GoogleCSEEngine.definition.settings.parse({}).cx).toBe(
			"partner-pub-8993703457585266:4862972284",
		);
	});
});

/** A `Response` with `Set-Cookie` headers (the Fetch API folds them otherwise). */
function response(status: number, body: string | null, headers: [string, string][] = []) {
	return new Response(body, { status, headers: new Headers(headers) });
}

describe("Yahoo", () => {
	test("parses results, unwraps redirect links and splits off dates", () => {
		const results = YahooEngine.parseResults(parse(YAHOO_HTML));
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			url: "https://www.kernel.org/",
			title: "The Linux Kernel Archives",
			content:
				"This site is operated by the Linux Kernel Organization, a 501 (c)3 nonprofit corporation.",
			publishedAt: new Date("Sep 20, 2026").getTime(),
		});
		expect(results[1]).toEqual({
			url: "https://github.com/torvalds/linux",
			title: "GitHub - torvalds/linux: Linux kernel source tree · GitHub",
			content: "Linux kernel source tree.",
			publishedAt: undefined,
		});
	});

	test("skips ads", () => {
		const html = `<ol class="reg searchCenterTopAds"><li><div class="dd algo algo-sr"><div class="compTitle"><a href="https://www.example.com/ad">Ad</a></div></div></li></ol>`;
		expect(YahooEngine.parseResults(parse(html))).toEqual([]);
	});

	test("reads corrections and related searches", () => {
		const root = parse(YAHOO_HTML);
		expect(YahooEngine.parseCorrections(root)).toEqual(["linux kernel"]);
		expect(YahooEngine.parseSuggestions(root)).toEqual(["linux kernel", "linux kernel version"]);
	});

	test("resolves r.search.yahoo.com links", () => {
		expect(
			YahooCommon.resolveLink(
				"https://r.search.yahoo.com/_ylt=A;_ylu=B/RV=2/RE=1/RO=10/RU=https%3a%2f%2fexample.org%2fa%3fb%3d1/RK=2/RS=x-",
			),
		).toBe("https://example.org/a?b=1");
		expect(YahooCommon.resolveLink("https://example.org/")).toBe("https://example.org/");
		expect(YahooCommon.resolveLink("https://r.search.yahoo.com/cbclk2/abc")).toBeNull();
		expect(YahooCommon.resolveLink("javascript:void(0)")).toBeNull();
	});

	test("parses dates", () => {
		const now = Date.UTC(2026, 8, 28);
		expect(YahooCommon.parseDate("19 hours ago · ", now)).toBe(now - 19 * 3_600_000);
		expect(YahooCommon.parseDate("Sep 22, 2026 · ")).toBe(new Date("Sep 22, 2026").getTime());
		expect(YahooCommon.parseDate("Tom's Hardware")).toBeUndefined();
	});

	test("does the bot-check cookie round trip and reuses the cookies", async () => {
		const requests: { url: string; cookies: Record<string, string> }[] = [];
		const replies = [
			response(307, null, [
				["location", "/_bv/v.gif?orig=%2Fsearch&_bvc=1.abc"],
				["set-cookie", "YBV=v0.1; Domain=search.yahoo.com; Path=/"],
				["set-cookie", "A1=d=AQAB&S=AQ; Domain=.yahoo.com; Path=/"],
			]),
			response(307, null, [["location", "https://search.yahoo.com/search?p=linux+kernel"]]),
			response(200, YAHOO_HTML),
			response(200, YAHOO_HTML),
		];
		const http = {
			request: async (url: string, init: any) => {
				requests.push({ url, cookies: init.cookies });
				expect(init.redirect).toBe("manual");
				return replies.shift()!;
			},
		} as any;
		const engine = new YahooEngine(
			testEngineConfig({ slug: "yahoo-jar-test", type: "yahoo" }),
			{},
			http,
		);

		const result = await engine.search(testQuery({ language: "de-DE", safesearch: 2, page: 2 }));
		expect(result.results).toHaveLength(2);
		expect(result.corrections).toEqual(["linux kernel"]);

		const first = new URL(requests[0]!.url);
		expect(first.searchParams.get("b")).toBe("8");
		expect(first.searchParams.get("vl")).toBe("lang_de");
		expect(new URLSearchParams(requests[0]!.cookies.sB).get("vm")).toBe("r");
		expect(requests[1]!.url).toBe("https://search.yahoo.com/_bv/v.gif?orig=%2Fsearch&_bvc=1.abc");
		expect(requests[1]!.cookies).toMatchObject({ YBV: "v0.1", A1: "d=AQAB&S=AQ" });
		expect(requests[2]!.cookies.YBV).toBe("v0.1");

		// The next search starts with the cookies from the jar.
		await engine.search(testQuery());
		expect(requests).toHaveLength(4);
		expect(requests[3]!.cookies.YBV).toBe("v0.1");
	});

	test("retries a first-contact 500 once with the cookies it handed out", async () => {
		const replies = [
			response(500, "", [["set-cookie", "YBV=v0.2; Path=/"]]),
			response(200, YAHOO_NEWS_HTML),
		];
		const cookies: Record<string, string>[] = [];
		const http = {
			request: async (_url: string, init: any) => {
				cookies.push(init.cookies);
				return replies.shift();
			},
		} as any;
		const engine = new YahooNewsEngine(
			testEngineConfig({ slug: "yahoo-500-test", type: "yahoo_news", categories: ["news"] }),
			{},
			http,
		);
		const result = await engine.search(testQuery({ category: "news" }));
		expect(result.results).toHaveLength(2);
		expect(cookies[1]?.YBV).toBe("v0.2");
	});

	test("reports a failing bot check as blocked", async () => {
		const http = {
			request: async () => response(500, "", [["set-cookie", "YBV=v0.3; Path=/"]]),
		} as any;
		const engine = new YahooEngine(
			testEngineConfig({ slug: "yahoo-blocked-test", type: "yahoo" }),
			{},
			http,
		);
		const error = await engine.search(testQuery()).catch((err) => err);
		expect(error).toBeInstanceOf(EngineError);
		expect(error.kind).toBe("blocked");
	});

	test("parses news articles", () => {
		const now = Date.UTC(2026, 8, 28);
		const results = YahooNewsEngine.parseResults(parse(YAHOO_NEWS_HTML), now);
		expect(results).toEqual([
			{
				url: "https://tech.yahoo.com/computing/articles/linux-enthusiasts-see-10-second-122000351.html",
				title: "Linux enthusiasts see 10-second kernel compilation times on the horizon",
				content:
					"It won’t be long until Linux enthusiasts will be able to complete a clean kernel build in under 10 s...",
				template: "news",
				publishedAt: now - 86_400_000,
				thumbnail:
					"https://s.yimg.com/fz/api/res/1.2/aS8.8Ud880m9tpxp6NoEsw--~C/YXBwaWQ9c3JjaGRk/https://media.zenfs.com/en/toms_hardware_319/ceb0fea577c76bfdf15d7782ff09cf37.jpg",
				source: "Tom's Hardware",
			},
			{
				url: "https://tech.yahoo.com/cybersecurity/articles/muse-undocumented-endpoint-192808424.html",
				title: "Muse’s Undocumented Endpoint Turns macOS Agent Into a Local Backdoor",
				content: "The Agent as an Attack Surface",
				template: "news",
				publishedAt: new Date("Sep 22, 2026").getTime(),
				thumbnail: undefined,
				source: "Forkast News",
			},
		]);
	});
});

describe("Ecosia", () => {
	test("parses results, skipping ads and Ecosia's own links", () => {
		expect(EcosiaEngine.parseResults(parse(ECOSIA_HTML))).toEqual([
			{
				url: "https://www.kernel.org/",
				title: "The Linux Kernel Archives",
				content: "This site is operated by the Linux Kernel Organization.",
			},
			{
				url: "https://en.wikipedia.org/wiki/Linux_kernel",
				title: "Linux kernel - Wikipedia",
				content: "The Linux kernel is a free and open-source kernel.",
			},
		]);
	});

	test("reports the Cloudflare challenge as blocked", async () => {
		const raw = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>`;
		const http = { html: async () => ({ root: parse(raw), raw }) } as any;
		const engine = new EcosiaEngine(testEngineConfig({ type: "ecosia" }), {}, http);
		const error = await engine.search(testQuery()).catch((err) => err);
		expect(error).toBeInstanceOf(EngineError);
		expect(error.kind).toBe("blocked");
	});

	test("requests 0-based pages", async () => {
		const urls: string[] = [];
		const http = {
			html: async (url: string) => {
				urls.push(url);
				return { root: parse(ECOSIA_HTML), raw: ECOSIA_HTML };
			},
		} as any;
		const engine = new EcosiaEngine(testEngineConfig({ type: "ecosia" }), {}, http);
		await engine.search(testQuery({ page: 3 }));
		expect(urls.map((url) => new URL(url).searchParams.get("p"))).toEqual(["2"]);
	});
});
