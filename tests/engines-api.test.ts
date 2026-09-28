import { describe, expect, test } from "bun:test";
import { DailymotionEngine } from "../server/lib/search/engines/dailymotion";
import { GuardianEngine } from "../server/lib/search/engines/guardian";
import { HackerNewsEngine } from "../server/lib/search/engines/hackerNews";
import { LemmyEngine } from "../server/lib/search/engines/lemmy";
import { OpenverseEngine } from "../server/lib/search/engines/openverse";
import { PeerTubeEngine } from "../server/lib/search/engines/peertube";
import { RedditEngine } from "../server/lib/search/engines/reddit";
import { WikimediaCommonsEngine } from "../server/lib/search/engines/wikimediaCommons";
import { EngineError } from "../server/lib/search/errors";
import { AppConstants } from "../server/lib/utils/constants";
import { testEngineConfig, testQuery } from "./helpers/engineConfig";

// Fixtures are trimmed copies of the API responses the engines got when they were written
// (2026-09). The Guardian's follows its documented format: its public `test` key is gone.

const HN_JSON = {
	nbHits: 4735,
	hits: [
		{
			objectID: "2555349",
			title: "Boot a linux kernel right inside your browser. ",
			url: "http://bellard.org/jslinux/",
			author: "neopanz",
			points: 1820,
			num_comments: 239,
			created_at_i: 1305608989,
		},
		{
			objectID: "49813759",
			title: "Show HN: Run Linux kernel drivers in userspace on Neptune OS",
			url: null,
			story_text:
				"For the past ten years I have been working on a side project.<p>It runs &quot;Linux&quot; drivers.",
			author: "cl91",
			points: 1,
			num_comments: 0,
			created_at_i: 1790102076,
		},
		{ objectID: "1", title: "", url: "https://example.org/untitled" },
	],
};

const REDDIT_FEED = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><category term=" reddit.com" label="r/ reddit.com"/><updated>2026-09-28T14:09:48+00:00</updated><title>reddit.com: search results - linux kernel</title><entry><author><name>/u/johnniethemask</name><uri>https://www.reddit.com/user/johnniethemask</uri></author><content type="html">&lt;div&gt; Home of the Linux kernel community. &lt;/div&gt; &lt;div&gt; &lt;a href=&quot;https://www.reddit.com/r/linuxkernel/&quot;&gt;[link]&lt;/a&gt; &lt;/div&gt;</content><id>t5_qm7nq</id><link href="https://www.reddit.com/r/linuxkernel/" /><updated>2018-10-31T07:17:54+00:00</updated><title>Linux Kernel Community</title></entry><entry><author><name>/u/ControlCAD</name><uri>https://www.reddit.com/user/ControlCAD</uri></author><category term="technology" label="r/technology"/><content type="html">&lt;table&gt; &lt;tr&gt;&lt;td&gt; &lt;a href=&quot;https://www.reddit.com/r/technology/comments/1w4dj6h/linux_kernel_nears_record_2000_vulnerabilities/&quot;&gt; &lt;img src=&quot;https://external-preview.redd.it/z-fg.jpeg?width=640&amp;amp;crop=smart&quot; /&gt; &lt;/a&gt; &lt;/td&gt;&lt;td&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/ControlCAD&quot;&gt; /u/ControlCAD &lt;/a&gt; &amp;#32; to &amp;#32; &lt;a href=&quot;https://www.reddit.com/r/technology/&quot;&gt; r/technology &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://www.tomshardware.com/software/linux/linux-kernel-nears-2-000-cves-per-release&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt; &amp;#32; &lt;span&gt;&lt;a href=&quot;https://www.reddit.com/r/technology/comments/1w4dj6h/linux_kernel_nears_record_2000_vulnerabilities/&quot;&gt;[comments]&lt;/a&gt;&lt;/span&gt; &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_1w4dj6h</id><media:thumbnail url="https://external-preview.redd.it/z-fg.jpeg?width=640&amp;crop=smart" /><link href="https://www.reddit.com/r/technology/comments/1w4dj6h/linux_kernel_nears_record_2000_vulnerabilities/" /><updated>2026-09-01T14:25:51+00:00</updated><published>2026-09-01T14:25:51+00:00</published><title>Linux kernel nears record 2,000 vulnerabilities — maintainers say they are &quot;completely overwhelmed&quot;</title></entry><entry><author><name>/u/Individual-Editor-41</name><uri>https://www.reddit.com/user/Individual-Editor-41</uri></author><category term="linuxmint" label="r/linuxmint"/><content type="html">&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Linux kernel 7.3 is coming.&lt;/p&gt;&lt;p&gt;Things won&amp;#39;t feel laggy anymore.&lt;/p&gt; &lt;/div&gt;&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/Individual-Editor-41&quot;&gt; /u/Individual-Editor-41 &lt;/a&gt; &amp;#32; to &amp;#32; &lt;a href=&quot;https://www.reddit.com/r/linuxmint/&quot;&gt; r/linuxmint &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://www.reddit.com/r/linuxmint/comments/1vu31ai/which_features/&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content><id>t3_1vu31ai</id><link href="https://www.reddit.com/r/linuxmint/comments/1vu31ai/which_features/" /><updated>2026-08-21T01:59:54+00:00</updated><published>2026-08-21T01:59:54+00:00</published><title>Which features of Linux kernel 7.3 are you most hyped to try out?</title></entry></feed>`;

const LEMMY_JSON = {
	posts: [
		{
			post: {
				id: 2227385,
				name: "Here's all the source code",
				body:
					'In 2000, I wrote a **Linux** device driver that "decrypted" the output of a [certain device](https://example.org).\n\n> The "encryption" was only a XOR',
				ap_id: "https://lemmy.sdf.org/post/1322164",
				published: "2023-07-27T04:23:45.817590Z",
				nsfw: false,
			},
			creator: { name: "ExtremeDullard" },
			community: {
				name: "maliciouscompliance",
				title: "Malicious Compliance",
				actor_id: "https://lemmy.world/c/maliciouscompliance",
				nsfw: false,
			},
			counts: { score: 927, comments: 88 },
		},
		{
			post: {
				id: 44699522,
				name:
					"Wine 11 rewrites how Linux runs Windows games at the kernel level, and the speed gains are massive",
				url: "https://www.xda-developers.com/wine-11-rewrites-linux-runs-windows-games-speed-gains/",
				ap_id: "https://lemmy.world/post/44699522",
				published: "2026-03-24T21:35:41.523658Z",
				nsfw: false,
			},
			creator: { name: "monica_b1998" },
			community: {
				name: "linux_gaming",
				title: "Linux Gaming",
				actor_id: "https://lemmy.world/c/linux_gaming",
				nsfw: false,
			},
			counts: { score: 915, comments: 120 },
		},
		{
			post: {
				id: 3,
				name: "Linux error starter pack",
				url: "https://lemmy.world/pictrs/image/db35237a.webp",
				ap_id: "https://lemm.ee/post/27686937",
				published: "2024-03-24T11:14:09.436Z",
				thumbnail_url: "https://lemmy.world/pictrs/image/db35237a-thumb.webp",
			},
			creator: { name: "sag", display_name: "Sag" },
			community: { name: "linuxmemes", actor_id: "https://lemmy.world/c/linuxmemes" },
			counts: { score: 1, comments: 0 },
		},
		{
			post: { id: 4, name: "Flagged", ap_id: "https://lemmy.world/post/4", nsfw: true },
			community: { name: "x", actor_id: "https://lemmy.world/c/x" },
		},
	],
	comments: [
		{
			comment: {
				id: 5862081,
				content:
					"I feel it's equally important to point out that Torvalds [recognized his toxic behavior](https://www.techspot.com/news/76460), apologized",
				ap_id: "https://lemmy.world/comment/5862081",
				published: "2023-12-07T03:07:47.129270Z",
			},
			creator: { name: "dohpaz42" },
			post: { name: "Linus does not fuck around", nsfw: false },
			community: {
				name: "linuxmemes",
				title: "linuxmemes",
				actor_id: "https://lemmy.world/c/linuxmemes",
			},
		},
	],
	communities: [
		{
			community: {
				name: "linux",
				title: "Linux",
				actor_id: "https://lemmy.ml/c/linux",
				icon: "https://lemmy.ml/pictrs/image/q98XK4sKtw.png",
				nsfw: false,
				description:
					"From Wikipedia, the free encyclopedia\n\nLinux is a family of open source Unix-like operating systems",
			},
			counts: { subscribers: 67775 },
		},
	],
};

const OPENVERSE_JSON = {
	result_count: 240,
	results: [
		{
			title: "Crashed payphone -- Linux kernel panic",
			foreign_landing_url: "https://www.flickr.com/photos/26699508@N04/2529389660",
			url: "https://live.staticflickr.com/2399/2529389660_e13396fe57_b.jpg",
			creator: "sethschoen",
			license: "by-sa",
			license_version: "2.0",
			provider: "flickr",
			source: "flickr",
			width: 768,
			height: 1024,
			thumbnail: "https://api.openverse.org/v1/images/cbe943d3-ba7c-4207-b326-a90194dacbd3/thumb/",
		},
		{
			title: null,
			foreign_landing_url: "https://commons.wikimedia.org/w/index.php?curid=31414762",
			url: "https://upload.wikimedia.org/wikipedia/commons/9/99/Linux_kernel_and_OpenGL_video_games.svg",
			creator: null,
			license: "cc0",
			license_version: "1.0",
			provider: "wikimedia",
			source: "wikimedia",
			width: null,
			height: null,
		},
		{
			title: "No image",
			foreign_landing_url: "https://example.org/",
			url: "data:image/png;base64,AA",
		},
	],
};

const COMMONS_JSON = {
	batchcomplete: "",
	query: {
		pages: {
			"93991152": {
				title: "File:Linux 5.7 kernel panic.png",
				index: 3,
				imageinfo: [
					{
						url: "https://upload.wikimedia.org/wikipedia/commons/7/78/Linux_5.7_kernel_panic.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
						thumburl:
							"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Linux_5.7_kernel_panic.png/500px-Linux_5.7_kernel_panic.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
						descriptionurl: "https://commons.wikimedia.org/wiki/File:Linux_5.7_kernel_panic.png",
						width: 720,
						height: 400,
						mime: "image/png",
						extmetadata: {
							ObjectName: { value: "Linux 5.7 kernel panic" },
							ImageDescription: { value: "Kernel panic of custom-compiled Linux kernel 5.7.18" },
							Artist: {
								value:
									'<a href="//commons.wikimedia.org/wiki/User:AnsyahF" title="User:AnsyahF">AnsyahF</a>',
							},
							LicenseShortName: { value: "GPL" },
						},
					},
				],
			},
			"116187577": {
				title: "File:Linux kernel interfaces-tr.svg",
				index: 1,
				imageinfo: [
					{
						url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Linux_kernel_interfaces-tr.svg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
						thumburl:
							"https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Linux_kernel_interfaces-tr.svg/500px-Linux_kernel_interfaces-tr.svg.png",
						descriptionurl: "https://commons.wikimedia.org/wiki/File:Linux_kernel_interfaces-tr.svg",
						width: 1536,
						height: 1152,
						mime: "image/svg+xml",
						extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" } },
					},
				],
			},
			"2": {
				title: "File:Scan of a kernel.tif",
				index: 2,
				imageinfo: [
					{
						url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Scan_of_a_kernel.tif",
						thumburl:
							"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Scan_of_a_kernel.tif/lossy-page1-400px-Scan_of_a_kernel.tif.jpg",
						descriptionurl: "https://commons.wikimedia.org/wiki/File:Scan_of_a_kernel.tif",
						width: 4000,
						height: 3000,
						mime: "image/tiff",
					},
				],
			},
			"4": {
				title: "File:Linux kernel talk.webm",
				index: 4,
				imageinfo: [{ url: "https://upload.wikimedia.org/t.webm", mime: "video/webm" }],
			},
		},
	},
};

const GUARDIAN_JSON = {
	response: {
		status: "ok",
		userTier: "developer",
		total: 412,
		startIndex: 1,
		pageSize: 20,
		currentPage: 1,
		pages: 21,
		orderBy: "relevance",
		results: [
			{
				id: "technology/2026/sep/01/linux-kernel-cves",
				type: "article",
				sectionId: "technology",
				sectionName: "Technology",
				webPublicationDate: "2026-09-01T12:30:00Z",
				webTitle: "Linux kernel maintainers overwhelmed by AI-found bugs",
				webUrl: "https://www.theguardian.com/technology/2026/sep/01/linux-kernel-cves",
				apiUrl: "https://content.guardianapis.com/technology/2026/sep/01/linux-kernel-cves",
				fields: {
					trailText: "Volunteers say the flood of reports is <strong>unsustainable</strong>",
					thumbnail: "https://media.guim.co.uk/abc/0_0_5000_3000/500.jpg",
					byline: "Alex Hern",
				},
				isHosted: false,
				pillarId: "pillar/news",
				pillarName: "News",
			},
		],
	},
};

const DAILYMOTION_JSON = {
	total: 1000,
	list: [
		{
			id: "x6emf",
			title: "Linux-Kernel",
			description: "Une p'tite anim' sympa...",
			url: "https://www.dailymotion.com/video/x6emf",
			thumbnail_360_url: "https://s1.dmcdn.net/v/18-71g5wt4mi-YGt/x360",
			duration: 47,
			"owner.screenname": "Katana666",
			created_time: 1151405631,
			views_total: 1,
			allow_embed: true,
		},
		{
			id: "xarh0cm",
			title: "Membongkar Kernel Linux",
			description: "Playlist video terkait:<br />▪ Materi Data Science &amp; Artificial Intelligence",
			url: "https://www.dailymotion.com/video/xarh0cm",
			thumbnail_360_url: "https://s2.dmcdn.net/v/cody61gOXA60F68TP/x360",
			duration: 3906,
			"owner.screenname": "MC Project",
			created_time: 1784806299,
			views_total: 1,
			allow_embed: false,
		},
	],
};

/** One video from Sepia Search (absolute URLs) and one from framatube.org (instance paths). */
const PEERTUBE_SEPIA_JSON = {
	total: 14643,
	data: [
		{
			uuid: "1edf388c-fb67-4e71-bc09-7a298d428a8d",
			name: "Linux kernel -> USB -> DIY VGA driver -> arcade cabinet",
			url: "https://peertube.scd31.com/videos/watch/1edf388c-fb67-4e71-bc09-7a298d428a8d",
			truncatedDescription:
				"The colours are all wrong and the draw rate is terrible. But it works!!!!",
			duration: 18,
			isLive: false,
			nsfw: false,
			views: 1238,
			publishedAt: "2025-12-13T23:40:34.295Z",
			thumbnailUrl:
				"https://peertube.scd31.com/lazy-static/thumbnails/4ee65189-86f7-46d9-a0aa-c58da6344244.jpg",
			thumbnailPath: "/lazy-static/thumbnails/4ee65189-86f7-46d9-a0aa-c58da6344244.jpg",
			embedUrl: "https://peertube.scd31.com/videos/embed/4P7f8kGvvN3mH43nbeRaRX",
			embedPath: "/videos/embed/4P7f8kGvvN3mH43nbeRaRX",
			account: { displayName: "n3tcat", host: "peertube.scd31.com" },
			channel: { displayName: "scd31", host: "peertube.scd31.com" },
		},
		{ uuid: "x", name: "Flagged", url: "https://tube.example/videos/watch/x", nsfw: true },
	],
};

const PEERTUBE_INSTANCE_JSON = {
	total: 335,
	data: [
		{
			uuid: "53cbdbc3-065f-4466-a000-a2e0cad6d52d",
			name: "Linux 5.4, FTC vs YouTube, Android | This Week in Linux 88",
			url: "https://share.tube/videos/watch/53cbdbc3-065f-4466-a000-a2e0cad6d52d",
			truncatedDescription:
				"https://destinationlinux.network\r\n\r\nOn this episode of This Week in Linux, Linux Kernel 5.4 was released",
			duration: 3606,
			isLive: false,
			nsfw: false,
			views: 143,
			publishedAt: "2019-11-26T02:30:36.514Z",
			thumbnailPath: "/lazy-static/thumbnails/6ac26507-472e-4c1c-9600-b5c864ccb1c0.jpg",
			embedPath: "/videos/embed/bma5GVh6dyWLqBU9z7TsNz",
			account: { displayName: "TuxDigital", host: "share.tube" },
			channel: { displayName: "TuxDigital", host: "share.tube" },
		},
	],
};

/** A fake `EngineHttp` that records requests and answers with a fixture. */
function fakeHttp(body: unknown) {
	const calls: Array<{ url: URL; init: any }> = [];
	const answer = async (url: string, init?: any) => {
		calls.push({ url: new URL(url), init });
		return body;
	};
	return { calls, http: { json: answer, text: answer } as any };
}

function call(calls: ReturnType<typeof fakeHttp>["calls"], index: number) {
	const recorded = calls[index];
	if (!recorded) throw new Error(`Expected request #${index + 1}, got ${calls.length}`);
	return recorded;
}

function engine<T>(
	Cls: {
		new (config: any, settings: any, http?: any): T;
		definition: { type: string; settings: any };
	},
	body: unknown,
	settings: Record<string, unknown> = {},
) {
	const { calls, http } = fakeHttp(body);
	const config = testEngineConfig({ slug: Cls.definition.type, type: Cls.definition.type });
	return { engine: new Cls(config, Cls.definition.settings.parse(settings), http), calls };
}

describe("Hacker News", () => {
	test("maps stories, falls back to the HN item and skips untitled hits", () => {
		const results = HackerNewsEngine.parseResults(HN_JSON);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			url: "http://bellard.org/jslinux/",
			title: "Boot a linux kernel right inside your browser.",
			content: "1820 points · 239 comments · by neopanz",
			template: "web",
			publishedAt: 1305608989000,
			author: "neopanz",
			source: undefined,
		});
		expect(results[1]?.url).toBe("https://news.ycombinator.com/item?id=49813759");
		expect(results[1]?.content).toBe(
			'1 point · 0 comments · by cl91 — For the past ten years I have been working on a side project. It runs "Linux" drivers.',
		);
	});

	test("news results carry the source", () => {
		const [result] = HackerNewsEngine.parseResults(HN_JSON, "news");
		expect(result?.template).toBe("news");
		expect(result?.source).toBe("Hacker News");
	});

	test("rejects unknown JSON", () => {
		expect(() => HackerNewsEngine.parseResults({} as any)).toThrow(EngineError);
	});

	test("news sorts by date, time ranges and min points become numeric filters", async () => {
		const { engine: hn, calls } = engine(HackerNewsEngine, HN_JSON, { min_points: 5 });
		await hn.search(testQuery({ category: "news", page: 3, timeRange: "week" }));
		const url = call(calls, 0).url;
		expect(url.pathname).toBe("/api/v1/search_by_date");
		expect(url.searchParams.get("page")).toBe("2");
		expect(url.searchParams.get("tags")).toBe("story");
		const [since = "", points] = (url.searchParams.get("numericFilters") ?? "").split(",");
		expect(Number(since.replace("created_at_i>", ""))).toBeCloseTo(
			Date.now() / 1000 - 7 * 86_400,
			-2,
		);
		expect(points).toBe("points>=5");

		const { engine: web, calls: webCalls } = engine(HackerNewsEngine, HN_JSON);
		await web.search(testQuery());
		expect(call(webCalls, 0).url.pathname).toBe("/api/v1/search");
		expect(call(webCalls, 0).url.searchParams.has("numericFilters")).toBe(false);
	});
});

describe("Reddit", () => {
	test("parses subreddits, link posts and self posts from the Atom feed", () => {
		const [subreddit, link, self, ...rest] = RedditEngine.parseFeed(REDDIT_FEED);
		expect(rest).toHaveLength(0);
		expect(subreddit).toEqual({
			url: "https://www.reddit.com/r/linuxkernel/",
			title: "Linux Kernel Community",
			content: "Home of the Linux kernel community.",
			source: "r/linuxkernel",
			thumbnail: undefined,
		});
		expect(link).toEqual({
			url: "https://www.reddit.com/r/technology/comments/1w4dj6h/linux_kernel_nears_record_2000_vulnerabilities/",
			title:
				'Linux kernel nears record 2,000 vulnerabilities — maintainers say they are "completely overwhelmed"',
			content: "Link to tomshardware.com",
			publishedAt: Date.parse("2026-09-01T14:25:51+00:00"),
			author: "ControlCAD",
			source: "r/technology",
			thumbnail: "https://external-preview.redd.it/z-fg.jpeg?width=640&crop=smart",
		});
		expect(self?.content).toBe("Linux kernel 7.3 is coming. Things won't feel laggy anymore.");
		expect(self?.author).toBe("Individual-Editor-41");
	});

	test("rejects non-feed responses", () => {
		expect(() => RedditEngine.parseFeed("<html><body>blocked</body></html>")).toThrow(EngineError);
	});

	test("pages by requesting more entries, NSFW follows safe search", async () => {
		const { engine: reddit, calls } = engine(RedditEngine, REDDIT_FEED, { sort: "top" });
		const page2 = await reddit.search(testQuery({ page: 2, safesearch: 0, timeRange: "month" }));
		const params = call(calls, 0).url.searchParams;
		expect(params.get("limit")).toBe("50");
		expect(params.get("include_over_18")).toBe("1");
		expect(params.get("sort")).toBe("top");
		expect(params.get("t")).toBe("month");
		// The fixture has 3 entries: all belong to page 1.
		expect(page2.results).toEqual([]);

		expect((await reddit.search(testQuery({ page: 5 }))).results).toEqual([]);
		expect(calls).toHaveLength(1);
	});
});

describe("Lemmy", () => {
	test("maps posts, communities and comments", () => {
		const results = LemmyEngine.parseResults(LEMMY_JSON, "https://lemmy.world");
		expect(results.map((r) => r.url)).toEqual([
			"https://lemmy.sdf.org/post/1322164",
			"https://www.xda-developers.com/wine-11-rewrites-linux-runs-windows-games-speed-gains/",
			// Image uploads link to the discussion; the NSFW post is dropped.
			"https://lemm.ee/post/27686937",
			"https://lemmy.ml/c/linux",
			"https://lemmy.world/comment/5862081",
		]);
		const [text, link, image, community, comment] = results;
		expect(text?.content).toBe(
			'In 2000, I wrote a Linux device driver that "decrypted" the output of a certain device. The "encryption" was only a XOR',
		);
		expect(text?.source).toBe("c/maliciouscompliance@lemmy.world");
		expect(text?.publishedAt).toBe(Date.parse("2023-07-27T04:23:45.817590Z"));
		expect(link?.content).toBe("915 points · 120 comments");
		expect(image?.author).toBe("Sag");
		expect(image?.thumbnail).toBe("https://lemmy.world/pictrs/image/db35237a-thumb.webp");
		expect(community).toMatchObject({
			title: "Linux",
			source: "c/linux@lemmy.ml",
			thumbnail: "https://lemmy.ml/pictrs/image/q98XK4sKtw.png",
		});
		expect(comment?.title).toBe("Comment on “Linus does not fuck around”");
		expect(comment?.content).toStartWith(
			"I feel it's equally important to point out that Torvalds recognized",
		);
	});

	test("keeps NSFW posts with safe search off, rejects unknown JSON", () => {
		const results = LemmyEngine.parseResults(LEMMY_JSON, "https://lemmy.world", true);
		expect(results.some((r) => r.title === "Flagged")).toBe(true);
		expect(() => LemmyEngine.parseResults({} as any, "https://lemmy.world")).toThrow(EngineError);
		expect(LemmyEngine.parseResults({ posts: [] }, "https://lemmy.world")).toEqual([]);
	});

	test("time ranges switch to the matching Top sort", async () => {
		const { engine: lemmy, calls } = engine(LemmyEngine, LEMMY_JSON, {
			instance_url: "https://lemmy.ml/",
		});
		await lemmy.search(testQuery({ page: 2, timeRange: "week" }));
		expect(call(calls, 0).url.origin + call(calls, 0).url.pathname).toBe(
			"https://lemmy.ml/api/v3/search",
		);
		expect(call(calls, 0).url.searchParams.get("sort")).toBe("TopWeek");
		expect(call(calls, 0).url.searchParams.get("type_")).toBe("Posts");
		expect(call(calls, 0).url.searchParams.get("page")).toBe("2");
	});

	test("markdown to text", () => {
		expect(
			LemmyEngine.markdownToText("# Title\n\n* **bold** item\n\n![img](x.png)\n----\n`code`"),
		).toBe("Title bold item code");
		expect(LemmyEngine.markdownToText("a".repeat(400))).toHaveLength(300);
	});
});

describe("Openverse", () => {
	test("maps images with attribution", () => {
		const [first, second, ...rest] = OpenverseEngine.parseResults(OPENVERSE_JSON);
		expect(rest).toHaveLength(0);
		expect(first).toEqual({
			url: "https://www.flickr.com/photos/26699508@N04/2529389660",
			title: "Crashed payphone -- Linux kernel panic",
			content: "By sethschoen · CC BY-SA 2.0",
			template: "image",
			imgSrc: "https://live.staticflickr.com/2399/2529389660_e13396fe57_b.jpg",
			thumbnail: "https://api.openverse.org/v1/images/cbe943d3-ba7c-4207-b326-a90194dacbd3/thumb/",
			width: 768,
			height: 1024,
			author: "sethschoen",
			source: "flickr",
		});
		expect(second?.title).toBe("Untitled");
		expect(second?.content).toBe("CC0 1.0");
		expect(second?.thumbnail).toBe(second?.imgSrc);
		expect(OpenverseEngine.license("pdm", "1.0")).toBe("Public Domain Mark 1.0");
	});

	test("mature content only with safe search off; stops at the anonymous result cap", async () => {
		const { engine: openverse, calls } = engine(OpenverseEngine, OPENVERSE_JSON);
		await openverse.search(testQuery({ category: "images", safesearch: 0, page: 2 }));
		await openverse.search(testQuery({ category: "images" }));
		expect(call(calls, 0).url.searchParams.get("mature")).toBe("true");
		expect(call(calls, 0).url.searchParams.get("page")).toBe("2");
		expect(call(calls, 1).url.searchParams.has("mature")).toBe(false);
		expect((await openverse.search(testQuery({ category: "images", page: 13 }))).results).toEqual([]);
		expect(calls).toHaveLength(2);
	});
});

describe("Wikimedia Commons", () => {
	test("orders by search rank, strips metadata HTML and tracking params", () => {
		const results = WikimediaCommonsEngine.parseResults(COMMONS_JSON);
		// The video is skipped.
		expect(results.map((r) => r.title)).toEqual([
			"Linux kernel interfaces-tr",
			"Scan of a kernel",
			"Linux 5.7 kernel panic",
		]);
		const [svg, tiff, png] = results;
		expect(png).toEqual({
			url: "https://commons.wikimedia.org/wiki/File:Linux_5.7_kernel_panic.png",
			title: "Linux 5.7 kernel panic",
			content: "Kernel panic of custom-compiled Linux kernel 5.7.18 · By AnsyahF · GPL",
			template: "image",
			imgSrc: "https://upload.wikimedia.org/wikipedia/commons/7/78/Linux_5.7_kernel_panic.png",
			thumbnail:
				"https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Linux_5.7_kernel_panic.png/500px-Linux_5.7_kernel_panic.png",
			width: 720,
			height: 400,
			author: "AnsyahF",
			source: "Wikimedia Commons",
		});
		expect(svg?.imgSrc).toBe(
			"https://upload.wikimedia.org/wikipedia/commons/8/8f/Linux_kernel_interfaces-tr.svg",
		);
		expect(svg?.content).toBe("CC BY-SA 4.0");
		// Browsers can't show TIFF: use the JPEG thumbnail.
		expect(tiff?.imgSrc).toEndWith("-Scan_of_a_kernel.tif.jpg");
		expect(WikimediaCommonsEngine.parseResults({ batchcomplete: "" } as any)).toEqual([]);
	});

	test("searches the File namespace with the bot User-Agent", async () => {
		const { engine: commons, calls } = engine(WikimediaCommonsEngine, COMMONS_JSON);
		await commons.search(testQuery({ category: "images", page: 3, language: "de-DE" }));
		const params = call(calls, 0).url.searchParams;
		expect(params.get("gsrsearch")).toBe("linux kernel filetype:bitmap|drawing");
		expect(params.get("gsrnamespace")).toBe("6");
		expect(params.get("gsroffset")).toBe("40");
		expect(params.get("iiextmetadatalanguage")).toBe("de");
		expect(call(calls, 0).init.headers["User-Agent"]).toBe(AppConstants.BOT_USER_AGENT);
	});
});

describe("The Guardian", () => {
	test("maps articles", () => {
		expect(GuardianEngine.parseResults(GUARDIAN_JSON)).toEqual([
			{
				url: "https://www.theguardian.com/technology/2026/sep/01/linux-kernel-cves",
				title: "Linux kernel maintainers overwhelmed by AI-found bugs",
				content: "Volunteers say the flood of reports is unsustainable",
				template: "news",
				publishedAt: Date.parse("2026-09-01T12:30:00Z"),
				thumbnail: "https://media.guim.co.uk/abc/0_0_5000_3000/500.jpg",
				author: "Alex Hern",
				source: "The Guardian",
			},
		]);
	});

	test("requires a key", () => {
		expect(GuardianEngine.definition.requiresConfiguration).toBe(true);
		expect(GuardianEngine.definition.settings.safeParse({}).success).toBe(false);
	});

	test("sends the key, order and from-date", async () => {
		const { engine: guardian, calls } = engine(GuardianEngine, GUARDIAN_JSON, { api_key: "k" });
		const response = await guardian.search(testQuery({ category: "news", timeRange: "day" }));
		expect(response.totalResults).toBe(412);
		const params = call(calls, 0).url.searchParams;
		expect(params.get("api-key")).toBe("k");
		expect(params.get("order-by")).toBe("relevance");
		expect(params.get("from-date")).toBe(
			new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
		);
	});

	test("maps a rejected key to a config error and an out-of-range page to no results", async () => {
		const rejected = engine(GuardianEngine, { message: "Unauthorized" }, { api_key: "bad" }).engine;
		const error = await rejected.search(testQuery({ category: "news" })).catch((err) => err);
		expect(error).toBeInstanceOf(EngineError);
		expect(error.kind).toBe("config");

		const beyond = engine(
			GuardianEngine,
			{
				response: {
					status: "error",
					message: "requested page is beyond the number of available pages",
				},
			},
			{ api_key: "k" },
		).engine;
		expect((await beyond.search(testQuery({ category: "news", page: 30 }))).results).toEqual([]);
	});
});

describe("Dailymotion", () => {
	test("maps videos", () => {
		const [first, second] = DailymotionEngine.parseResults(DAILYMOTION_JSON);
		expect(first).toEqual({
			url: "https://www.dailymotion.com/video/x6emf",
			title: "Linux-Kernel",
			content: "Une p'tite anim' sympa...",
			template: "video",
			thumbnail: "https://s1.dmcdn.net/v/18-71g5wt4mi-YGt/x360",
			duration: "0:47",
			author: "Katana666",
			publishedAt: 1151405631000,
			views: 1,
			embedUrl: "https://www.dailymotion.com/embed/video/x6emf",
			source: "Dailymotion",
		});
		expect(second?.content).toBe(
			"Playlist video terkait: ▪ Materi Data Science & Artificial Intelligence",
		);
		expect(second?.duration).toBe("1:05:06");
		expect(second?.embedUrl).toBeUndefined();
		expect(() => DailymotionEngine.parseResults({ error: {} } as any)).toThrow(EngineError);
	});

	test("maps safe search, language and time range", async () => {
		const { engine: dailymotion, calls } = engine(DailymotionEngine, DAILYMOTION_JSON);
		await dailymotion.search(
			testQuery({ category: "videos", safesearch: 0, language: "de-AT", timeRange: "day" }),
		);
		const params = call(calls, 0).url.searchParams;
		expect(params.get("family_filter")).toBe("false");
		expect(params.get("languages")).toBe("de");
		expect(Number(params.get("created_after"))).toBeCloseTo(Date.now() / 1000 - 86_400, -2);
		expect(params.get("fields")).toContain("owner.screenname");
	});
});

describe("PeerTube", () => {
	test("maps Sepia Search results and drops NSFW videos", () => {
		const results = PeerTubeEngine.parseResults(PEERTUBE_SEPIA_JSON, "https://sepiasearch.org");
		expect(results).toEqual([
			{
				url: "https://peertube.scd31.com/videos/watch/1edf388c-fb67-4e71-bc09-7a298d428a8d",
				title: "Linux kernel -> USB -> DIY VGA driver -> arcade cabinet",
				content: "The colours are all wrong and the draw rate is terrible. But it works!!!!",
				template: "video",
				thumbnail:
					"https://peertube.scd31.com/lazy-static/thumbnails/4ee65189-86f7-46d9-a0aa-c58da6344244.jpg",
				duration: "0:18",
				author: "n3tcat",
				publishedAt: Date.parse("2025-12-13T23:40:34.295Z"),
				views: 1238,
				embedUrl: "https://peertube.scd31.com/videos/embed/4P7f8kGvvN3mH43nbeRaRX",
				source: "peertube.scd31.com",
			},
		]);
		expect(
			PeerTubeEngine.parseResults(PEERTUBE_SEPIA_JSON, "https://sepiasearch.org", true),
		).toHaveLength(2);
	});

	test("resolves instance paths: thumbnails on the instance, embeds on the origin", () => {
		const [video] = PeerTubeEngine.parseResults(PEERTUBE_INSTANCE_JSON, "https://framatube.org");
		expect(video?.thumbnail).toBe(
			"https://framatube.org/lazy-static/thumbnails/6ac26507-472e-4c1c-9600-b5c864ccb1c0.jpg",
		);
		expect(video?.embedUrl).toBe(
			"https://share.tube/videos/embed/53cbdbc3-065f-4466-a000-a2e0cad6d52d",
		);
		expect(video?.duration).toBe("1:00:06");
		expect(video?.source).toBe("share.tube");
	});

	test("pages with start/count and maps safe search", async () => {
		const { engine: peertube, calls } = engine(PeerTubeEngine, PEERTUBE_SEPIA_JSON);
		await peertube.search(
			testQuery({ category: "videos", page: 3, safesearch: 0, timeRange: "year" }),
		);
		const url = call(calls, 0).url;
		expect(url.origin + url.pathname).toBe("https://sepiasearch.org/api/v1/search/videos");
		expect(url.searchParams.get("start")).toBe("40");
		expect(url.searchParams.get("count")).toBe("20");
		expect(url.searchParams.get("nsfw")).toBe("both");
		expect(url.searchParams.get("startDate")).toStartWith(String(new Date().getUTCFullYear() - 1));
	});
});

test("API engines have unique types and parse empty settings unless they need configuration", () => {
	const classes = [
		HackerNewsEngine,
		RedditEngine,
		LemmyEngine,
		OpenverseEngine,
		WikimediaCommonsEngine,
		GuardianEngine,
		DailymotionEngine,
		PeerTubeEngine,
	];
	const types = classes.map((cls) => cls.definition.type);
	expect(new Set(types).size).toBe(types.length);
	for (const { definition } of classes) {
		if (!definition.requiresConfiguration) {
			expect(definition.settings.safeParse({}).success).toBe(true);
		}
	}
});
