import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { StartpageAnubis, StartpageCommon } from "../server/lib/search/engines/startpage/common";
import {
	StartpageImagesEngine,
	StartpageNewsEngine,
	StartpageVideosEngine,
} from "../server/lib/search/engines/startpage/media";
import { StartpageEngine } from "../server/lib/search/engines/startpage/web";
import { EngineError } from "../server/lib/search/errors";
import type { EngineHttp } from "../server/lib/search/http";
import { SearchUtils } from "../server/lib/search/utils";
import { testEngineConfig, testQuery } from "./helpers/engineConfig";

// Fixtures are trimmed from real Startpage responses (2026-09): the SERP props are embedded in
// the page's hydration script exactly like this.
function serpPage(app: string, props: unknown): string {
	return `<!DOCTYPE html><html lang="en"><head><title>Startpage Search Results</title></head>
<body><div id="root"></div><script>
  function hydrateSSR() {
    if (typeof UIStartpage.${app} === 'undefined') {
      var errMsg = "Hydration failed. 'UIStartpage.${app}' is undefined"
      return
    }
    ReactDOM.hydrateRoot(
      rootNode,
      React.createElement(UIStartpage.${app}, ${JSON.stringify(props)})
    )
    window.dispatchEvent(new Event('app:hydrated'))
  }
</script></body></html>`;
}

function challengePage(randomData: string, difficulty: number, id = "01a0e851-4f59-7785") {
	const challenge = {
		rules: { algorithm: "fast", difficulty },
		challenge: { id, method: "fast", randomData, difficulty, spent: false },
	};
	return `<!doctype html><html><head><script id="anubis_version" type="application/json">"v1.26.4"
</script><script id="anubis_challenge" type="application/json">${JSON.stringify(challenge)}
</script><script id="anubis_base_prefix" type="application/json">""
</script></head><body><h1>Making sure you&#39;re not a bot!</h1></body></html>`;
}

function pagination(next?: { number: number; token?: string }) {
	return {
		current: 1,
		pages: [
			{ name: "1", selected: true, nextPrev: false, number: 1 },
			...(next ? [{ name: "Next", nextPrev: true, selected: false, ...next }] : []),
		],
	};
}

const PROXY = "/av/proxy-image?piurl=";

const WEB_PROPS = {
	render: {
		search_sc: "sc-web-1",
		segment: "startpage.udog",
		presenter: {
			pagination: pagination({ number: 2 }),
			pagination_backends: ["google"],
			regions: {
				mainline: [
					{ display_type: "spellsuggest-google", presented_count: 0, results: [] },
					{
						display_type: "ads-google-top",
						presented_count: 1,
						results: [{ page_options: { adPage: 1, adsafe: "medium" }, thash: "VqDOQotl" }],
					},
					{
						display_type: "web-google",
						presented_count: 4,
						backfill: false,
						results: [
							{
								title: "The <b>Linux Kernel</b> Archives",
								clickUrl: "https://www.kernel.org/",
								description:
									"The <b>Linux Kernel</b> Archives ; mainline: 7.3-rc5, 2026-09-27, [tarball] ; stable: 7.2.8, [&nbsp;...",
								displayUrl: "https://www.kernel.org/",
								siteLinks: [],
								anonViewUrl: "https://eu3-browse.startpage.com/av/proxy?ep=4955777755446b79&ek=5547",
								siteTitleData: "The Linux Kernel Archives",
								sourceIndex: 0,
							},
							{
								title: "What is the <b>Linux kernel</b>? - Red Hat",
								clickUrl: "https://www.redhat.com/en/topics/linux/what-is-the-linux-kernel",
								description:
									'Feb 27, 2019 <b>...</b> The <b>Linux</b>® <b>kernel</b> is the core {of the} "OS" interface.',
								displayUrl: "https://www.redhat.com/en/topics/linux/what-is-the-linux-kernel",
								siteLinks: [],
								anonViewUrl: "https://eu3-browse.startpage.com/av/proxy?ep=4955777755446b7a&ek=5547",
								sourceIndex: 1,
							},
							{
								title: "<b>Linux</b> | endoflife.date",
								clickUrl: "https://endoflife.date/linux",
								description: "3 days ago <b>...</b> Here&#39;s the <b>Linux kernel</b> release schedule.",
								displayUrl: "https://endoflife.date/linux",
								siteLinks: [],
								sourceIndex: 2,
							},
							{ title: "Settings", clickUrl: "/do/settings", description: "Startpage internal" },
						],
					},
					{ display_type: "ads-google-bottom", presented_count: 1, results: [{ thash: "VqDO" }] },
				],
				sidebar: [{ display_type: "enrichment_slot-enrichment_engine", results: [{}] }],
			},
		},
	},
	translations: { all_category: "All", see_more_flights: "See more +" },
};

const IMAGE_PROPS = {
	render: {
		search_sc: "sc-images-1",
		segment: "startpage.udog",
		presenter: {
			pagination: pagination({ number: 2 }),
			regions: {
				mainline: [
					{
						display_type: "aylf-bing-images",
						results: [
							{
								title: "Logo",
								query: "Linux Kernel Logo",
								thumbnailUrl: `${PROXY}https%3A%2F%2Ftse1.mm.bing.net%2Fth%3Fq%3DLinux%2BKernel%2BLogo&sp=1790604044T96ad`,
							},
						],
					},
					{
						display_type: "images-bing",
						results: [
							{
								title: "Understanding the Linux Kernel [Detailed Guide] - Linux Magazine",
								clickUrl: `${PROXY}https%3A%2F%2Flinuxnetmag.com%2Fwp-content%2Fuploads%2F2020%2F10%2FKernel_Layout.png&sp=1790604044T763a`,
								altClickUrl: "https://linuxnetmag.com/understanding-the-linux-kernel/",
								displayUrl: "https://linuxnetmag.com/understanding-the-linux-kernel",
								format: "png",
								height: 1012,
								width: 1280,
								thumbnailUrl: `${PROXY}https%3A%2F%2Ftse2.mm.bing.net%2Fth%2Fid%2FOIP.hjLmIMKPKP4ThR7J9NX8JwHaF2%3Fr%3D0%26pid%3DApi&sp=1790604044Tb813`,
								anonAltUrl: "https://eu3-browse.startpage.com/av/proxy?ep=4a5642444852&ek=5547",
								rawImageUrl: "https://linuxnetmag.com/wp-content/uploads/2020/10/Kernel_Layout.png",
							},
							{
								title: "Anatomy of the Linux kernel",
								clickUrl: `${PROXY}https%3A%2F%2Fdeveloper.ibm.com%2Fimages%2Ffigure2.jpg&sp=1790604044T7b48`,
								altClickUrl: "https://developer.ibm.com/articles/l-linux-kernel/",
								height: 250,
								width: 370,
								thumbnailUrl: `${PROXY}https%3A%2F%2Ftse2.mm.bing.net%2Fth%2Fid%2FOIP.XYd6ScVg&sp=1790604044Taf87`,
							},
							{ title: "No page", clickUrl: `${PROXY}https%3A%2F%2Fexample.org%2Fa.png&sp=1` },
						],
					},
					{
						display_type: "query_expansions-bing",
						results: [{ title: "Structure Diagram", query: "Linux Kernel Structure Diagram" }],
					},
				],
			},
		},
	},
};

const NEWS_PROPS = {
	render: {
		search_sc: "sc-news-1",
		presenter: {
			regions: {
				mainline: [
					{
						display_type: "news-bing",
						results: [
							{
								title: "Linux enthusiasts see 10-second kernel compilation times on the horizon",
								clickUrl:
									"https://www.msn.com/en-us/technology/software/linux-enthusiasts-see-10-second-kernel-compilation-times/ar-AA2d3wHV",
								description: "Upcoming advances like Zen 6 are expected to help.",
								source: "XDA Developers on MSN",
								date: "2026-09-27",
								thumbnailUrl: `${PROXY}https%3A%2F%2Fwww.bing.com%2Fth%3Fid%3DONUT.jzVZAicf%26pid%3DNews&sp=1790604048T1dcd`,
								anonViewUrl: "https://eu3-browse.startpage.com/av/proxy?ep=4e6d355642&ek=5547",
								naturalizedDateParts: { format: "{0} hours ago", args: ["14"] },
							},
							{
								title: "CISA alerts of active exploitation of three <b>Linux kernel</b> flaws",
								clickUrl:
									"https://www.bleepingcomputer.com/news/security/cisa-alerts-of-active-exploitation/",
								description: "The U.S. Cybersecurity and Infrastructure Security Agency is warning.",
								date: "2026-09-25",
							},
						],
					},
				],
			},
		},
	},
};

const VIDEO_PROPS = {
	render: {
		search_sc: "sc-video-1",
		segment: "startpage.udog",
		presenter: {
			pagination: pagination({ number: 2, token: "CAoQAA" }),
			pagination_backends: ["youtube"],
			regions: {
				mainline: [
					{
						display_type: "video-youtube",
						results: [
							{
								channelTitle: "The Linux Foundation",
								clickUrl: "https://www.youtube.com/watch?v=QatE61Ynwrw",
								thumbnailUrl: `${PROXY}https%3A%2F%2Fi.ytimg.com%2Fvi%2FQatE61Ynwrw%2Fmqdefault.jpg&sp=1790604053T6672`,
								title: "Getting to Know the Linux Kernel: A Beginner's Guide",
								description:
									'Getting to Know the Linux Kernel\n\n"A Beginner\'s Guide" offers an overview.',
								viewCount: "123936",
								publisher: "YouTube",
								duration: "42:46",
								publishDate: "Thu, 25 May 2023",
								anonViewUrl: "https://eu3-browse.startpage.com/av/proxy?ep=4e68736c4942&ek=5547",
							},
						],
					},
				],
			},
		},
	},
};

function html(body: string, setCookies: string[] = [], status = 200) {
	const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
	for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
	return new Response(body, { status, headers });
}

interface FakeRequest {
	url: string;
	init: EngineHttp.RequestInit;
}

let agents = 0;

/** An `EngineHttp` stand-in with its own user agent, so each test gets its own gate/session cache. */
function fakeHttp(respond: (request: FakeRequest) => Response) {
	const requests: FakeRequest[] = [];
	const http = {
		userAgent: `startpage-test-agent-${++agents}`,
		async request(url: string, init: EngineHttp.RequestInit = {}) {
			const request = { url, init };
			requests.push(request);
			return respond(request);
		},
	};
	return { http: http as unknown as EngineHttp, requests };
}

const settings = (overrides: Partial<StartpageCommon.Settings> = {}) =>
	StartpageCommon.Settings.parse(overrides);

function webEngine(http: EngineHttp, overrides: Partial<StartpageCommon.Settings> = {}) {
	return new StartpageEngine(
		testEngineConfig({ slug: "startpage-test", type: "startpage" }),
		settings(overrides),
		http,
	);
}

async function failure(promise: Promise<unknown>): Promise<EngineError> {
	const error = await promise.then(
		() => null,
		(err) => err,
	);
	expect(error).toBeInstanceOf(EngineError);
	return error as EngineError;
}

const isPass = (url: string) => url.includes("/.within.website/x/cmd/anubis/api/pass-challenge");

describe("Startpage parsers", () => {
	test("extracts the SERP props despite braces, quotes and U+2028 inside strings", () => {
		const serp = StartpageCommon.extractSerp(serpPage("AppSerpWeb", WEB_PROPS), "AppSerpWeb");
		expect(serp).toEqual(WEB_PROPS);
		expect(StartpageCommon.extractSerp(serpPage("AppSerpWeb", WEB_PROPS), "AppSerpNews")).toBeNull();
		expect(
			StartpageCommon.extractSerp('React.createElement(UIStartpage.AppSerpWeb, {"a":', "AppSerpWeb"),
		).toBeNull();
	});

	test("parses web results, strips highlights and Google's date prefix, skips ads and internal links", () => {
		const now = Date.now();
		const results = StartpageEngine.parseResults(WEB_PROPS);
		expect(results).toHaveLength(3);
		expect(results[0]).toEqual({
			url: "https://www.kernel.org/",
			title: "The Linux Kernel Archives",
			content:
				"The Linux Kernel Archives ; mainline: 7.3-rc5, 2026-09-27, [tarball] ; stable: 7.2.8, [ ...",
			publishedAt: undefined,
		});
		expect(results[1]).toMatchObject({
			title: "What is the Linux kernel? - Red Hat",
			content: 'The Linux® kernel is the core {of the} "OS" interface.',
			publishedAt: Date.UTC(2019, 1, 27),
		});
		expect(results[2]?.content).toBe("Here's the Linux kernel release schedule.");
		expect(Math.abs((results[2]?.publishedAt ?? 0) - (now - 3 * 86_400_000))).toBeLessThan(60_000);
	});

	test("links through Anonymous View when enabled (falling back to the direct link)", () => {
		const results = StartpageEngine.parseResults(WEB_PROPS, true);
		expect(results[0]?.url).toBe(
			"https://eu3-browse.startpage.com/av/proxy?ep=4955777755446b79&ek=5547",
		);
		expect(results[2]?.url).toBe("https://endoflife.date/linux");
	});

	test("parses image results and unwraps Startpage's image proxy", () => {
		const results = StartpageImagesEngine.parseResults(IMAGE_PROPS);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			url: "https://linuxnetmag.com/understanding-the-linux-kernel/",
			title: "Understanding the Linux Kernel [Detailed Guide] - Linux Magazine",
			template: "image",
			imgSrc: "https://linuxnetmag.com/wp-content/uploads/2020/10/Kernel_Layout.png",
			thumbnail: "https://tse2.mm.bing.net/th/id/OIP.hjLmIMKPKP4ThR7J9NX8JwHaF2?r=0&pid=Api",
			width: 1280,
			height: 1012,
			source: "linuxnetmag.com",
		});
		expect(results[1]).toMatchObject({
			title: "Anatomy of the Linux kernel",
			imgSrc: "https://developer.ibm.com/images/figure2.jpg",
			source: "developer.ibm.com",
		});
		expect(StartpageImagesEngine.parseResults(IMAGE_PROPS, true)[0]?.url).toBe(
			"https://eu3-browse.startpage.com/av/proxy?ep=4a5642444852&ek=5547",
		);
	});

	test("parses news results with relative or absolute dates", () => {
		const now = Date.UTC(2026, 8, 28, 12);
		const results = StartpageNewsEngine.parseResults(NEWS_PROPS, false, now);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			url: "https://www.msn.com/en-us/technology/software/linux-enthusiasts-see-10-second-kernel-compilation-times/ar-AA2d3wHV",
			title: "Linux enthusiasts see 10-second kernel compilation times on the horizon",
			content: "Upcoming advances like Zen 6 are expected to help.",
			template: "news",
			publishedAt: now - 14 * 3_600_000,
			thumbnail: "https://www.bing.com/th?id=ONUT.jzVZAicf&pid=News",
			source: "XDA Developers on MSN",
		});
		expect(results[1]).toMatchObject({
			title: "CISA alerts of active exploitation of three Linux kernel flaws",
			publishedAt: Date.UTC(2026, 8, 25),
			thumbnail: undefined,
			source: "bleepingcomputer.com",
		});
	});

	test("parses video results", () => {
		expect(StartpageVideosEngine.parseResults(VIDEO_PROPS)).toEqual([
			{
				url: "https://www.youtube.com/watch?v=QatE61Ynwrw",
				title: "Getting to Know the Linux Kernel: A Beginner's Guide",
				content: 'Getting to Know the Linux Kernel "A Beginner\'s Guide" offers an overview.',
				template: "video",
				thumbnail: "https://i.ytimg.com/vi/QatE61Ynwrw/mqdefault.jpg",
				duration: "42:46",
				author: "The Linux Foundation",
				publishedAt: Date.UTC(2023, 4, 25),
				views: 123936,
				embedUrl: "https://www.youtube-nocookie.com/embed/QatE61Ynwrw",
				source: "YouTube",
			},
		]);
		expect(SearchUtils.youtubeEmbedURL("https://vimeo.com/123")).toBeUndefined();
	});

	test("resolves result URLs", () => {
		expect(StartpageCommon.resultURL("/do/d/search?url=https%3A%2F%2Fexample.org%2Fa")).toBe(
			"https://example.org/a",
		);
		expect(StartpageCommon.resultURL(`${PROXY}https%3A%2F%2Fexample.org%2Fb.png&sp=1`)).toBe(
			"https://example.org/b.png",
		);
		expect(StartpageCommon.resultURL("/sp/search?query=x")).toBeUndefined();
		expect(StartpageCommon.resultURL("javascript:alert(1)")).toBeUndefined();
		expect(StartpageCommon.resultURL(undefined)).toBeUndefined();
	});
});

describe("Startpage query mapping", () => {
	test("maps locales to search languages and regions", () => {
		expect(StartpageCommon.language("all")).toBe("english");
		expect(StartpageCommon.language("de-AT")).toBe("deutsch");
		expect(StartpageCommon.language("nb")).toBe("norsk");
		expect(StartpageCommon.language("ko")).toBe("english");

		expect(StartpageCommon.region("all")).toBe("all");
		expect(StartpageCommon.region("en")).toBe("en_US");
		expect(StartpageCommon.region("en-GB")).toBe("en-GB_GB");
		expect(StartpageCommon.region("pt")).toBe("pt-BR_BR");
		expect(StartpageCommon.region("de-CH")).toBe("de_CH");
		expect(StartpageCommon.region("zh-HK")).toBe("zh-TW_HK");
		expect(StartpageCommon.region("nb-NO")).toBe("no_NO");
		expect(StartpageCommon.region("ko-XX")).toBe("all");
	});

	test("builds the preferences cookie", () => {
		const preferences = StartpageCommon.preferences(
			testQuery({ language: "de-DE", safesearch: 2 }),
		).split("N1N");
		expect(preferences).toContain("disable_family_filterEEEheavy");
		expect(preferences).toContain("languageEEEdeutsch");
		expect(preferences).toContain("language_uiEEEenglish");
		expect(preferences).toContain("search_results_regionEEEde_DE");
		expect(preferences).toContain("lang_homepageEEEs%2Fdevice%2Fen");
		expect(StartpageCommon.safeSearch(0)).toBe("none");
		expect(StartpageCommon.safeSearch(1)).toBe("moderate");
	});

	test("default settings parse", () => {
		expect(settings()).toEqual({
			anonymous_view: false,
			solve_anubis: true,
			anubis_max_difficulty: 4,
		});
	});
});

describe("Startpage Anubis gate", () => {
	test("reads current and legacy challenges", () => {
		expect(StartpageAnubis.readChallenge(challengePage("abc", 4, "id-1"))).toEqual({
			id: "id-1",
			randomData: "abc",
			difficulty: 4,
			algorithm: "fast",
		});
		const legacy = `<script id="anubis_challenge" type="application/json">{"challenge":"f00d","rules":{"algorithm":"fast","difficulty":2,"report_as":2}}</script>`;
		expect(StartpageAnubis.readChallenge(legacy)).toMatchObject({
			id: undefined,
			randomData: "f00d",
		});
		expect(StartpageAnubis.readChallenge('<script id="anubis_challenge">{oops</script>')).toBeNull();
		expect(
			StartpageAnubis.readChallenge(
				'<script id="anubis_challenge">{"challenge":{"randomData":"x"},"rules":{}}</script>',
			),
		).toBeNull();
	});

	test("solves the proof of work", async () => {
		const solution = await StartpageAnubis.solve("a2f0fe31c167", 2);
		expect(solution).not.toBeNull();
		const hash = createHash("sha256").update(`a2f0fe31c167${solution?.nonce}`).digest("hex");
		expect(solution?.hash).toBe(hash);
		expect(hash.startsWith("00")).toBe(true);
		expect(solution?.elapsedMs).toBeGreaterThan(0);
	});

	test("parses Set-Cookie lines", () => {
		const headers = new Headers();
		headers.append("Set-Cookie", "a=1; Path=/; Max-Age=300; HttpOnly");
		headers.append("Set-Cookie", "b=2; Expires=Mon, 28 Sep 2026 14:05:38 GMT; Secure");
		headers.append("Set-Cookie", "c=; Path=/; Max-Age=0");
		expect(StartpageAnubis.parseSetCookies(headers, 1000)).toEqual({
			a: { value: "1", expires: 301_000 },
			b: { value: "2", expires: Date.UTC(2026, 8, 28, 14, 5, 38) },
		});
	});

	test("passes the gate once and shares the auth cookie between instances", async () => {
		const { http, requests } = fakeHttp(({ url, init }) => {
			if (isPass(url)) {
				return html("", ["spchal-auth=jwt-token; Path=/; Domain=startpage.com; Max-Age=300"], 302);
			}
			if (init.cookies?.["spchal-auth"] !== "jwt-token") {
				return html(challengePage("abc", 1, "chal-1"), [
					"spchal-cookie-verification=chal-1; Path=/; Domain=startpage.com",
					"sp_pow=xyz; Max-Age=300; HttpOnly; Path=/",
				]);
			}
			return html(serpPage("AppSerpWeb", WEB_PROPS));
		});

		const response = await webEngine(http).search(testQuery({ query: "gate" }));
		expect(response.results).toHaveLength(3);
		expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
			"/sp/search",
			"/.within.website/x/cmd/anubis/api/pass-challenge",
			"/sp/search",
		]);

		const pass = requests[1]!;
		const params = new URL(pass.url).searchParams;
		expect(params.get("id")).toBe("chal-1");
		expect(params.get("redir")).toBe(requests[0]!.url);
		expect(params.get("response")).toBe(
			createHash("sha256")
				.update(`abc${params.get("nonce")}`)
				.digest("hex"),
		);
		expect(params.get("response")?.startsWith("0")).toBe(true);
		expect(pass.init.redirect).toBe("manual");
		expect(pass.init.cookies).toMatchObject({
			"spchal-cookie-verification": "chal-1",
			sp_pow: "xyz",
		});
		expect(pass.init.cookies?.preferences).toContain("disable_family_filterEEEmoderate");

		const other = new StartpageEngine(
			testEngineConfig({ id: 2, slug: "startpage-second", type: "startpage" }),
			settings(),
			http,
		);
		await other.search(testQuery({ query: "gate again" }));
		expect(requests).toHaveLength(4);
		expect(requests[3]!.init.cookies?.["spchal-auth"]).toBe("jwt-token");
	});

	test("refuses challenges above the difficulty limit", async () => {
		const { http, requests } = fakeHttp(() => html(challengePage("abc", 6)));
		const error = await failure(webEngine(http).search(testQuery()));
		expect(error.kind).toBe("blocked");
		expect(error.message).toContain("difficulty to 6");
		expect(requests).toHaveLength(1);
	});

	test("reports the gate as blocked when solving is disabled", async () => {
		const { http, requests } = fakeHttp(() => html(challengePage("abc", 1)));
		const error = await failure(webEngine(http, { solve_anubis: false }).search(testQuery()));
		expect(error.kind).toBe("blocked");
		expect(requests).toHaveLength(1);
	});

	test("reports a rejected solution or a repeated challenge as blocked", async () => {
		const rejected = fakeHttp(({ url }) =>
			isPass(url)
				? html("cookies disabled", ["spchal-auth=; Path=/; Max-Age=0"], 500)
				: html(challengePage("abc", 1)),
		);
		const error = await failure(webEngine(rejected.http).search(testQuery()));
		expect(error.kind).toBe("blocked");
		expect(error.message).toContain("rejected");

		const repeated = fakeHttp(({ url }) =>
			isPass(url) ? html("", ["spchal-auth=jwt; Max-Age=300"], 302) : html(challengePage("abc", 1)),
		);
		const again = await failure(webEngine(repeated.http).search(testQuery()));
		expect(again.kind).toBe("blocked");
		expect(again.message).toContain("re-served");
		expect(repeated.requests).toHaveLength(3);
	});
});

describe("Startpage search flow", () => {
	test("sends the filters with the first page", async () => {
		const { http, requests } = fakeHttp(() => html(serpPage("AppSerpNews", NEWS_PROPS)));
		const engine = new StartpageNewsEngine(
			testEngineConfig({ slug: "startpage-news", type: "startpage_news" }),
			settings(),
			http,
		);
		const response = await engine.search(
			testQuery({ category: "news", language: "en-GB", safesearch: 0, timeRange: "month" }),
		);
		expect(response.results).toHaveLength(2);
		const params = new URL(requests[0]!.url).searchParams;
		expect(Object.fromEntries(params)).toEqual({
			query: "linux kernel",
			cat: "news",
			language: "english",
			lui: "english",
			qadf: "none",
			qsr: "en-GB_GB",
			with_date: "m",
			pl: "opensearch",
		});
		expect(requests[0]!.init.language).toBe("en-GB");
	});

	test("bootstraps page 2 from page 1 and continues with the latest sc token", async () => {
		const { http, requests } = fakeHttp(({ init }) => {
			const props = structuredClone(WEB_PROPS);
			props.render.search_sc = `sc-${init.form?.page ?? 1}`;
			return html(serpPage("AppSerpWeb", props));
		});
		const engine = webEngine(http);
		const query = testQuery({ query: "paging", page: 2, timeRange: "week" });

		expect((await engine.search(query)).results).toHaveLength(3);
		expect(requests).toHaveLength(2);
		expect(requests[0]!.init.form).toBeUndefined();
		expect(new URL(requests[0]!.url).searchParams.get("with_date")).toBe("w");
		expect(requests[1]!.url).toBe("https://www.startpage.com/sp/search");
		expect(requests[1]!.init.form).toMatchObject({
			query: "paging",
			cat: "web",
			sc: "sc-1",
			t: "device",
			segment: "startpage.udog",
			page: "2",
			with_date: "w",
			qadf: "moderate",
		});

		await engine.search({ ...query, page: 3 });
		expect(requests).toHaveLength(3);
		expect(requests[2]!.init.form).toMatchObject({ sc: "sc-2", page: "3" });
	});

	test("chains video pages by page_token and never guesses a missing one", async () => {
		const { http, requests } = fakeHttp(() => html(serpPage("AppSerpVideos", VIDEO_PROPS)));
		const engine = new StartpageVideosEngine(
			testEngineConfig({ slug: "startpage-videos", type: "startpage_videos" }),
			settings(),
			http,
		);
		const query = testQuery({ query: "chain", category: "videos", timeRange: "day" });

		expect((await engine.search({ ...query, page: 3 })).results).toEqual([]);
		expect(requests).toHaveLength(0);

		expect((await engine.search({ ...query, page: 2 })).results).toHaveLength(1);
		expect(requests).toHaveLength(2);
		expect(requests[1]!.init.form).toMatchObject({ cat: "video", page: "2", page_token: "CAoQAA" });
		expect(requests[1]!.init.form?.with_date).toBeUndefined();

		// The fixture's "Next" points at page 2 again, so there is no token for page 3.
		expect((await engine.search({ ...query, page: 3 })).results).toEqual([]);
		expect(requests).toHaveLength(2);
	});

	test("reports captcha pages as blocked and unknown pages as parse errors", async () => {
		const captcha = fakeHttp(() =>
			html('<html><head><title>Startpage Captcha</title></head><form class="captcha-section">'),
		);
		expect((await failure(webEngine(captcha.http).search(testQuery()))).kind).toBe("blocked");

		const unknown = fakeHttp(() => html("<html><body>Something else</body></html>"));
		expect((await failure(webEngine(unknown.http).search(testQuery()))).kind).toBe("parse");
	});

	test("returns no results for an empty result page", async () => {
		const props = structuredClone(NEWS_PROPS);
		props.render.presenter.regions.mainline = [];
		const { http } = fakeHttp(() => html(serpPage("AppSerpNews", props)));
		const engine = new StartpageNewsEngine(
			testEngineConfig({ slug: "startpage-news-empty", type: "startpage_news" }),
			settings(),
			http,
		);
		expect(await engine.search(testQuery({ category: "news" }))).toEqual({ results: [] });
	});
});
