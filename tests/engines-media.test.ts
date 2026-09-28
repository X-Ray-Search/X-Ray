import { describe, expect, test } from "bun:test";
import { parse } from "node-html-parser";
import { BingVideosEngine } from "../server/lib/search/engines/bing/media";
import { BraveCommon } from "../server/lib/search/engines/brave/common";
import {
	BraveImagesEngine,
	BraveNewsEngine,
	BraveVideosEngine,
} from "../server/lib/search/engines/brave/media";
import { BraveEngine } from "../server/lib/search/engines/brave/web";
import { EngineError } from "../server/lib/search/errors";
import { EngineHttp } from "../server/lib/search/http";
import { SearchUtils } from "../server/lib/search/utils";
import { testEngineConfig, testQuery } from "./helpers/engineConfig";

// Fixtures are trimmed copies of the markup the engines returned when the parsers were written.

/** Answers every request with `body` and records what was asked for. */
class FakeHttp extends EngineHttp {
	readonly requests: { url: string; init?: EngineHttp.RequestInit }[] = [];

	constructor(private readonly body: string) {
		super({ slug: "test", proxyIds: [], timeoutMs: 1000 });
	}

	override async text(url: string, init?: EngineHttp.RequestInit) {
		this.requests.push({ url, init });
		return this.body;
	}
}

// The root layout node: UI strings (which mention "captcha" on every page) and devalue oddities.
const BRAVE_LAYOUT = String.raw`{type:"data",data:{userAgent:{uaString:"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",family:"Firefox",isPC:true},isMobile:false,searchLang:"en",country:"us",safesearch:"moderate",premiumCookieName:"__Secure-sku#brave-search-premium",premiumCookieValue:void 0,translations:{"Ask Brave_home":"\u003Cstrong>Ask\u003C/strong> Brave","Switch to traditional captcha":"Switch to traditional CAPTCHA","{number}-views":"{number} views"},serverTime:1790603873627,askV2:void 0},uses:{dependencies:["root:layout"],search_params:["spellcheck","q","goggles_id"],route:1}}`;

/** A Brave results page hydrated from `node` (the page's SvelteKit data node). */
function bravePage(node: string) {
	return `<!doctype html><html><head><title>linux kernel - Brave Search</title></head><body>
<div style="display: contents"><script nonce="jLmUw9EXFdm34HSrdHuwOQ==">
				{
					__sveltekit_16usmwj = {
						base: new URL(".", location).pathname.slice(0, -1),
						assets: "https://cdn.search.brave.com/serp/v3"
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("https://cdn.search.brave.com/serp/v3/_app/immutable/entry/start.nRLBn6wk.js"),
						import("https://cdn.search.brave.com/serp/v3/_app/immutable/entry/app.DEdCmrLx.js")
					]).then(([kit, app]) => {
						kit.start(app, element, {
							node_ids: [0, 30],
							data: [${BRAVE_LAYOUT},${node}],
							form: null,
							error: null
						});
					});
				}
			</script></div></body></html>`;
}

const BRAVE_IMAGES = bravePage(
	String.raw`{type:"data",data:{body:{key:1790603874110,mixerTime:474.705,badResults:void 0,response:{type:"images",query:{original:"linux kernel",show_strict_warning:false,altered:null,localQueryType:void 0,more_results_available:null,related_queries:[]},results:[{title:"File:Linux kernel ubiquity.svg",url:"https://commons.wikimedia.org/wiki/File:Linux_kernel_ubiquity.svg",is_source_local:false,description:"",page_age:null,page_fetched:"2026-01-03T19:59:17Z",family_friendly:true,bo_debug:{},icons:null,source:"commons.wikimedia.org",thumbnail:{src:"https://imgs.search.brave.com/33Eh-1tA7HU5XSP7qKJZ-bApQ0JPxFzIZITDeMjUQd0/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly91cGxv",alt:null,height:281,width:500,bg_color:null,original:"https://upload.wikimedia.org/wikipedia/commons/3/3a/Linux_kernel_ubiquity.svg",bo_serp_visible:true},properties:{url:"https://upload.wikimedia.org/wikipedia/commons/3/3a/Linux_kernel_ubiquity.svg",resized:"https://imgs.search.brave.com/dcwNfUaL6duSSg5V1c_0u-Ndf9Mvw4itPKNPDlFnJNo/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly91cGxv",height:720,width:1280,format:null,content_size:null},meta_url:{scheme:"https",netloc:"commons.wikimedia.org",hostname:"commons.wikimedia.org",path:"› wiki  › File:Linux_kernel_ubiquity.svg"},confidence:"high"},{title:"",url:"https:\u002F\u002Fen.wikipedia.org\u002Fwiki\u002FLinux_kernel",description:"",source:"en.wikipedia.org",thumbnail:{src:"https://imgs.search.brave.com/hLNLVK_BBSYf_d9JeqgOh5DB69zSx_LT6PyahiSG9VA/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly90aHVt",height:186,width:330,original:"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Linux_kernel_ubiquity.svg/330px-Linux_kernel_ubiquity.svg.png"},properties:{url:"https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Linux_kernel_ubiquity.svg/330px-Linux_kernel_ubiquity.svg.png",height:null,width:null}},{title:"Not a web page",url:"javascript:alert(1)",thumbnail:{src:"https://imgs.search.brave.com/x"},properties:{url:"https://example.org/x.png"}}]},blurImages:false},status:200,page:"images",searchPage:"/images",title:"linux kernel - Brave Search"},uses:{search_params:["q","goggles_id"],route:1}}`,
);

const BRAVE_VIDEOS = bravePage(
	String.raw`{type:"data",data:{query:"linux kernel",body:{key:1790603950407,mixerTime:336.492,badResults:void 0,response:{query:{original:"linux kernel",more_results_available:true,related_queries:[]},web:[],type:"videos",authors:[{name:"Brodie Robertson",url:"http://www.youtube.com/@BrodieRobertson",long_name:null,img:null}],results:[{title:"What is the Linux kernel? - A quick overview - YouTube",url:"https://www.youtube.com/watch?v=VbvMjUIEP-I",is_source_local:false,fetched_content_timestamp:1790094627,full_title:null,description:"Here's the video to watch if you're curious about the \u003Cstrong>Linux kernel\u003C/strong>.",page_age:"2024-07-08T13:42:20",page_fetched:null,family_friendly:true,bo_debug:{},icons:null,type:"video_result",video:{duration:"04:36",views:null,creator:"Quin's Tech Corner",publisher:"YouTube",thumbnail:null,tags:null,author:{name:"Quin's Tech Corner",url:"http://www.youtube.com/@QuinsTechCorner",long_name:null,img:null},requires_subscription:false},meta_url:{scheme:"https",netloc:"youtube.com",hostname:"www.youtube.com",path:"› watch"},thumbnail:{src:"https://imgs.search.brave.com/56nEbbjiLUgDXMutJDsxegWGM3zbLpp0vmuHR5RuVSg/rs:fit:200:200:1:0/g:ce/aHR0cHM6Ly9pLnl0",alt:null,height:null,width:null,original:"https://i.ytimg.com/vi/VbvMjUIEP-I/maxresdefault.jpg",bo_serp_visible:true},age:"July 8, 2024",publisher:null},{title:"What is a Kernel and what does it do?",url:"https://vimeo.com/123456",description:"Explore the kernels of Linux, Windows, and MacOS.",page_age:null,type:"video_result",video:{duration:"1:30:26",views:83338,creator:"SavvyNik",publisher:"Vimeo"},thumbnail:null,age:"3 days ago"}]}},status:200,page:"videos",searchPage:"/videos",title:"linux kernel - Brave Search",tf:"at"},uses:{search_params:["q","goggles_id"],route:1}}`,
);

const BRAVE_NEWS = bravePage(
	`{type:"data",data:{query:"linux kernel",status:200,page:"news",searchPage:"/news",title:"linux kernel - Brave Search",response:{type:"news",query:{original:"linux kernel",more_results_available:false,localQueryType:void 0},mixed:{type:"mixed",top:[],main:[{all:false,index:0,type:"news"}],side:[]},news:{type:"news",mutated_by_goggles:false,results:[{title:"New Linux Kernel Flaw Gives ARM64 KVM Guests Read-Write Access to Host Memory",url:"https://thehackernews.com/2026/09/new-linux-kernel-flaw-gives-arm64-kvm.html",description:"A Linux KVM flaw on ARM64 can expose host kernel memory to guests.",age:"5 hours ago",meta_url:{scheme:"https",netloc:"thehackernews.com",hostname:"thehackernews.com",path:"› 2026  › 09"},thumbnail:{src:"https://imgs.search.brave.com/amgTpcThlifitieE5-0FgwCPAS1LfmifLk9uwbb-UjU/rs:fit:200:200:1:0/g:ce/aHR0cHM6Ly9ibG9n",alt:null,original:null},is_live:false,profile:{name:"The Hacker News",url:"https://thehackernews.com/2026/09/new-linux-kernel-flaw-gives-arm64-kvm.html",long_name:null,img:null}},{title:"Linux 2.6.30 released",url:"https://lwn.net/Articles/337755/",description:"",age:"February 21, 2019",meta_url:{hostname:"lwn.net"},thumbnail:null,is_live:false,profile:null}]},rich:void 0},badResults:void 0,tf:"at"},uses:{search_params:["q","goggles_id"],route:1}}`,
);

const BING_VIDEOS_HTML = `
<div class="dg_u"><div id="mc_vtvc_video_1" mmeta="{&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=outside00000&quot;}"></div></div>
<div id="vm_c" data-svlnkt="" data-svstb="" data-svcptid="VideoResults"><div Class="tvsr va_canvas vsb_canvas" data-appns="video" data-k="7055"><div class="mccw ecc mc_fgvc">
<div class="mmlp "><div id="mc_vtvc_video_84" class="mc_vtvc b_canvas emb mc_vtvc_cc  isv creator fbc" mmeta="{&quot;mid&quot;:&quot;00BDAE63A0908AE1FCD100BDAE63A0908AE1FCD1&quot;,&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=QatE61Ynwrw&quot;,&quot;pgurl&quot;:&quot;https://www.youtube.com/watch?v=QatE61Ynwrw&quot;,&quot;turl&quot;:&quot;https://ts4.mm.bing.net/th?id=OVP.mO36DL45oZKSPTms4w_IYwHgFo&amp;pid=15.1&amp;W=160&amp;H=120&quot;}"><a aria-label="Getting to Know the Linux Kernel: A Beginner's Guide - Kelsey Steele &amp; Nischala Yelchuri, Microsoft from YouTube · Duration:  42 minutes 46 seconds  · 119.3K views · uploaded on May 25, 2023 · uploaded by The Linux Foundation · Click to play." class="mc_vtvc_link" href="/videos/riverview/relatedvideo?q=linux+kernel&amp;&amp;mid=00BDAE63A0908AE1FCD100BDAE63A0908AE1FCD1&amp;FORM=VRDGAR"><div class="mc_vtvc_con_rc"
                                 ourl="https://www.youtube.com/watch?v=QatE61Ynwrw"><div class="mc_vtvc_th b_canvas"><div class="cico"><img height="199" width="354" data-src-hq="https://tse4.mm.bing.net/th/id/OVP.mO36DL45oZKSPTms4w_IYwHgFo?w=354&amp;h=199&amp;c=7&amp;rs=1&amp;qlt=70&amp;o=7&amp;pid=2.1&amp;rm=3" alt="Getting to Know the Linux Kernel" class="rms_img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAIBTAA7" ></div><div class="mc_vtvc_ban_lo"><div class="vtbc_rc"><div class="mc_bc_rc_w b_smText"><div class="mc_bc_rc items">42:46</div><div class="mc_bc_rc pivot bpi_video_85"><span title=""><span class="mv_vtvc_play cipg "></span></span></div></div></div></div></div><div class="mc_vtvc_meta_w"><div class="mc_vtvc_meta"><div class="mc_vtvc_title b_promtxt" title="Getting to Know the Linux Kernel: A Beginner's Guide - Kelsey Steele &amp; Nischala Yelchuri, Microsoft"><strong>Getting to Know the Linux Kernel: A Beginner's Guide - Kelsey Steele &amp; Nischala Yelchuri, Microsoft</strong></div><div class="mc_vtvc_meta_block_area"><div class="mc_vtvc_meta_block"><div class="mc_vtvc_meta_row"><span class="meta_vc_content">119.3K views</span><span class="meta_pd_content">May 25, 2023</span></div><div class="mc_vtvc_meta_row"><span>YouTube</span><span class="mc_vtvc_meta_row_channel">The Linux Foundation</span></div></div></div></div></div><div class="vrhdata" ht="0" vrhm="{&quot;cid&quot;:&quot;vrptalgo&quot;,&quot;du&quot;:&quot;42:46&quot;,&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=QatE61Ynwrw&quot;,&quot;vt&quot;:&quot;Getting to Know the Linux Kernel: A Beginner's Guide - Kelsey Steele &amp; Nischala Yelchuri, Microsoft&quot;,&quot;pgurl&quot;:&quot;https://www.youtube.com/watch?v=QatE61Ynwrw&quot;}"></div></div></a></div></div>
<div class="mmlp "><div id="mc_vtvc_video_90" class="mc_vtvc b_canvas emb mc_vtvc_cc  fbc" mmeta="{&quot;murl&quot;:&quot;https://www.dailymotion.com/video/x8abcd&quot;,&quot;turl&quot;:&quot;https://ts3.mm.bing.net/th?id=OVF.x&amp;pid=15.1&quot;}"><a class="mc_vtvc_link" href="#"><div class="mc_vtvc_con_rc"><div class="mc_vtvc_th b_canvas"><div class="cico"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAIBTAA7" ></div></div><div class="mc_vtvc_meta_w"><div class="mc_vtvc_meta"><div class="mc_vtvc_meta_block_area"><div class="mc_vtvc_meta_block"><div class="mc_vtvc_meta_row"><span class="meta_pd_content">3 days ago</span></div><div class="mc_vtvc_meta_row"><span class="mc_vtvc_meta_row_channel">Kernel Recipes</span></div></div></div></div></div><div class="vrhdata" ht="0" vrhm="{&quot;du&quot;:&quot;01:22&quot;,&quot;vt&quot;:&quot;Kernel Recipes 2026&quot;}"></div></div></a></div></div>
<div class="mmlp "><div class="mc_vtvc" mmeta="{not json"></div></div>
</div></div>
<div class="slide" data-appns="video" role="listitem"><div id="mc_vtvc_video_167" class="mc_vtvc b_canvas emb mc_vtvc_cc " mmeta="{&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=QatE61Ynwrw&quot;,&quot;turl&quot;:&quot;https://ts3.mm.bing.net/th?id=OVF.dup&amp;pid=15.1&quot;}"></div></div>
<div class="slide" data-appns="video" role="listitem"><div id="mc_vtvc_video_168" class="mc_vtvc b_canvas emb mc_vtvc_cc " mmeta="{&quot;mid&quot;:&quot;05F21B7C60C8DFD0105405F21B7C60C8DFD01054&quot;,&quot;murl&quot;:&quot;https://www.youtube.com/watch?v=cfLjVPnNmNM&quot;,&quot;pgurl&quot;:&quot;https://www.youtube.com/watch?v=cfLjVPnNmNM&quot;,&quot;turl&quot;:&quot;https://ts3.mm.bing.net/th?id=OVF.Cr6i9EBW0%2fH1zpfnf5Qgtg&amp;pid=15.1&amp;W=89&amp;H=160&quot;}"><a aria-label="what is the linux kernel from YouTube · Duration:  15 seconds  · uploaded on 2 days ago · uploaded by Tech in 15 · Click to play." class="mc_vtvc_link" href="/videos/search?q=linux+kernel&amp;view=detail&amp;FORM=SVRTHV"><div class="mc_vtvc_con_rc"
                                 ourl="https://www.youtube.com/watch?v=cfLjVPnNmNM"><div class="mc_vtvc_th b_canvas"><div class="cico" style="width:237px;height:316px;"><div class="rms_iac" data-height="316" data-width="237" data-alt="what is the linux kernel" data-class="rms_img" data-src="https://tse3.mm.bing.net/th?id=OVF.Cr6i9EBW0%2fH1zpfnf5Qgtg&amp;w=237&amp;h=316&amp;c=7&amp;rs=1&amp;qlt=70&amp;o=7&amp;pid=1.7&amp;rm=3"></div></div><div class="mc_vtvc_ban_lo"><div class="vtbc_rc"><div class="mc_bc_rc_w b_smText"><div class="mc_bc_rc items">0:15</div></div></div></div></div><div class="mc_vtvc_meta"><div class="mc_vtvc_title b_promtxt" title="what is the linux kernel">what is the linux kernel</div><div class="mc_vtvc_meta_block_area"><div class="mc_vtvc_meta_row"><span class="meta_pd_content">2 days ago</span></div><div class="mc_vtvc_meta_row"><span>YouTube</span><span class="mc_vtvc_meta_row_channel">Tech in 15</span></div></div></div><div class="vrhdata" ht="0" vrhm="{&quot;du&quot;:&quot;00:15&quot;,&quot;vt&quot;:&quot;what is the linux kernel&quot;}"></div></div></a></div></div>
</div>`;

function braveResponse(html: string) {
	const response = BraveCommon.searchResponse(html);
	expect(response).not.toBeNull();
	return response!;
}

describe("Brave page data", () => {
	test("reads devalue literals without evaluating them", () => {
		const value = BraveCommon.parseLiteral(
			String.raw`{a:1,"b c":'it\'s',d:void 0,e:[1,,-2.5e1],f:new Date(1790603873627),g:Object.create(null),h:"\u003Cb>\u{1F600}\n",i:NaN,__proto__:{polluted:true},j:{k:null,l:true}}`,
		) as Record<string, any>;
		expect(value).toEqual({
			a: 1,
			"b c": "it's",
			d: undefined,
			e: [1, undefined, -25],
			f: undefined,
			g: undefined,
			h: "<b>😀\n",
			i: Number.NaN,
			j: { k: null, l: true },
		});
		expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
		expect(() => BraveCommon.parseLiteral("{a:")).toThrow();
		expect(() => BraveCommon.parseLiteral('"open')).toThrow();
	});

	test("finds the search response and tells captchas from empty pages", () => {
		expect(braveResponse(BRAVE_NEWS).type).toBe("news");
		expect(braveResponse(BRAVE_IMAGES).type).toBe("images");
		// The UI strings mention "captcha" on every page.
		expect(BraveCommon.isCaptcha(BRAVE_IMAGES)).toBe(false);
		expect(
			BraveCommon.isCaptcha("<title>Captcha - Brave Search</title><form>PoW captcha</form>"),
		).toBe(true);
		expect(BraveCommon.searchResponse("<html>kit.start(app, element, { data: [{broken</html>")).toBe(
			null,
		);
	});

	test("cookies and time filters", () => {
		expect(BraveCommon.cookies(testQuery({ safesearch: 0, language: "de" }))).toEqual({
			safesearch: "off",
			useLocation: "0",
			country: "de",
			ui_lang: "de-de",
		});
		expect(BraveCommon.cookies(testQuery({ safesearch: 2, language: "en-GB" })).ui_lang).toBe(
			"en-gb",
		);
		expect(BraveCommon.cookies(testQuery()).country).toBeUndefined();
		expect(BraveCommon.timeFilter("week")).toBe("pw");
		expect(BraveCommon.timeFilter(null)).toBeNull();
	});

	test("ages and embeds", () => {
		const now = Date.now();
		expect(SearchUtils.parseDate("2024-07-08T13:42:20")).toBe(Date.UTC(2024, 6, 8, 13, 42, 20));
		expect(new Date(SearchUtils.parseDate("July 8, 2024")!).getFullYear()).toBe(2024);
		expect(SearchUtils.parseDate("5 hours ago")).toBeLessThan(now - 4 * 3_600_000);
		expect(SearchUtils.parseDate("soon")).toBeUndefined();
		expect(SearchUtils.youtubeEmbedURL("https://youtu.be/VbvMjUIEP-I?t=3")).toBe(
			"https://www.youtube-nocookie.com/embed/VbvMjUIEP-I",
		);
		expect(SearchUtils.youtubeEmbedURL("https://www.youtube.com/shorts/cfLjVPnNmNM")).toBe(
			"https://www.youtube-nocookie.com/embed/cfLjVPnNmNM",
		);
		expect(SearchUtils.youtubeEmbedURL("https://vimeo.com/123456")).toBeUndefined();
	});
});

describe("Brave media engines", () => {
	test("images", () => {
		const [first, second, ...rest] = BraveImagesEngine.parseResults(braveResponse(BRAVE_IMAGES));
		expect(rest).toHaveLength(0);
		expect(first).toEqual({
			url: "https://commons.wikimedia.org/wiki/File:Linux_kernel_ubiquity.svg",
			title: "File:Linux kernel ubiquity.svg",
			template: "image",
			imgSrc: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Linux_kernel_ubiquity.svg",
			thumbnail:
				"https://imgs.search.brave.com/33Eh-1tA7HU5XSP7qKJZ-bApQ0JPxFzIZITDeMjUQd0/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly91cGxv",
			width: 1280,
			height: 720,
			source: "commons.wikimedia.org",
		});
		// `/` escapes decoded, empty titles fall back to the site, unknown sizes stay unset.
		expect(second?.url).toBe("https://en.wikipedia.org/wiki/Linux_kernel");
		expect(second?.title).toBe("en.wikipedia.org");
		expect(second?.width).toBeUndefined();
	});

	test("videos", () => {
		const [video, vimeo] = BraveVideosEngine.parseResults(braveResponse(BRAVE_VIDEOS));
		expect(video).toEqual({
			url: "https://www.youtube.com/watch?v=VbvMjUIEP-I",
			title: "What is the Linux kernel? - A quick overview",
			content: "Here's the video to watch if you're curious about the Linux kernel.",
			template: "video",
			publishedAt: Date.UTC(2024, 6, 8, 13, 42, 20),
			thumbnail:
				"https://imgs.search.brave.com/56nEbbjiLUgDXMutJDsxegWGM3zbLpp0vmuHR5RuVSg/rs:fit:200:200:1:0/g:ce/aHR0cHM6Ly9pLnl0",
			duration: "4:36",
			author: "Quin's Tech Corner",
			views: undefined,
			source: "YouTube",
			embedUrl: "https://www.youtube-nocookie.com/embed/VbvMjUIEP-I",
		});
		expect(vimeo?.duration).toBe("1:30:26");
		expect(vimeo?.views).toBe(83338);
		expect(vimeo?.thumbnail).toBeUndefined();
		expect(vimeo?.embedUrl).toBeUndefined();
		expect(vimeo?.publishedAt).toBeLessThan(Date.now() - 2 * 86_400_000);
	});

	test("news", () => {
		const [article, old] = BraveNewsEngine.parseResults(braveResponse(BRAVE_NEWS));
		expect(article?.source).toBe("The Hacker News");
		expect(article?.template).toBe("news");
		expect(article?.thumbnail).toStartWith("https://imgs.search.brave.com/");
		expect(article?.publishedAt).toBeLessThan(Date.now() - 4 * 3_600_000);
		expect(old?.source).toBe("lwn.net");
		expect(old?.thumbnail).toBeUndefined();
		expect(new Date(old!.publishedAt!).getFullYear()).toBe(2019);
	});

	test("requests: offset/tf only where supported, captcha and layout errors", async () => {
		const config = testEngineConfig({ categories: ["videos"] });
		const videosHttp = new FakeHttp(BRAVE_VIDEOS);
		await new BraveVideosEngine(config, {}, videosHttp).search(
			testQuery({ page: 3, timeRange: "day", safesearch: 0, language: "en-US" }),
		);
		const [request] = videosHttp.requests;
		expect(request?.url).toBe("https://search.brave.com/videos?q=linux+kernel&offset=2&tf=pd");
		expect(request?.init?.cookies).toMatchObject({ safesearch: "off", country: "us" });

		const imagesHttp = new FakeHttp(BRAVE_IMAGES);
		const images = new BraveImagesEngine(config, {}, imagesHttp);
		expect((await images.search(testQuery({ page: 2 }))).results).toHaveLength(0);
		await images.search(testQuery({ timeRange: "week" }));
		expect(imagesHttp.requests.map((r) => r.url)).toEqual([
			"https://search.brave.com/images?q=linux+kernel",
		]);

		const captcha = new BraveNewsEngine(config, {}, new FakeHttp("<p>Solve the captcha</p>"));
		await expect(captcha.search(testQuery())).rejects.toMatchObject({ kind: "blocked" });
		const unknown = new BraveNewsEngine(config, {}, new FakeHttp("<p>Something else</p>"));
		await expect(unknown.search(testQuery())).rejects.toBeInstanceOf(EngineError);
		await expect(unknown.search(testQuery())).rejects.toMatchObject({ kind: "parse" });
	});

	test("web search only reports a captcha when the page has no results data", async () => {
		const empty = bravePage(
			`{type:"data",data:{body:{response:{type:"search",web:{type:"search",results:[]}}}}}`,
		);
		const engine = new BraveEngine(testEngineConfig(), {}, new FakeHttp(empty));
		expect((await engine.search(testQuery())).results).toEqual([]);
		const blocked = new BraveEngine(testEngineConfig(), {}, new FakeHttp("<p>captcha</p>"));
		await expect(blocked.search(testQuery())).rejects.toMatchObject({ kind: "blocked" });
	});
});

describe("Bing videos", () => {
	test("parses tiles in the video results, skipping duplicates", () => {
		const results = BingVideosEngine.parseResults(parse(BING_VIDEOS_HTML));
		expect(results.map((r) => r.url)).toEqual([
			"https://www.youtube.com/watch?v=QatE61Ynwrw",
			"https://www.dailymotion.com/video/x8abcd",
			"https://www.youtube.com/watch?v=cfLjVPnNmNM",
		]);
		const [video, dailymotion, short] = results;
		expect(video).toEqual({
			url: "https://www.youtube.com/watch?v=QatE61Ynwrw",
			title:
				"Getting to Know the Linux Kernel: A Beginner's Guide - Kelsey Steele & Nischala Yelchuri, Microsoft",
			template: "video",
			thumbnail:
				"https://tse4.mm.bing.net/th/id/OVP.mO36DL45oZKSPTms4w_IYwHgFo?w=354&h=199&c=7&rs=1&qlt=70&o=7&pid=2.1&rm=3",
			duration: "42:46",
			author: "The Linux Foundation",
			views: 119_300,
			publishedAt: video!.publishedAt,
			source: "YouTube",
			embedUrl: "https://www.youtube-nocookie.com/embed/QatE61Ynwrw",
		});
		expect(new Date(video!.publishedAt!).getFullYear()).toBe(2023);

		// Fallbacks: title/duration from `vrhm`, thumbnail from `mmeta`, source from the URL.
		expect(dailymotion?.title).toBe("Kernel Recipes 2026");
		expect(dailymotion?.duration).toBe("1:22");
		expect(dailymotion?.thumbnail).toBe("https://ts3.mm.bing.net/th?id=OVF.x&pid=15.1");
		expect(dailymotion?.author).toBe("Kernel Recipes");
		expect(dailymotion?.source).toBe("dailymotion.com");
		expect(dailymotion?.views).toBeUndefined();

		expect(short?.thumbnail).toStartWith(
			"https://tse3.mm.bing.net/th?id=OVF.Cr6i9EBW0%2fH1zpfnf5Qgtg&w=237",
		);
		expect(short?.duration).toBe("0:15");
		expect(short?.publishedAt).toBeLessThan(Date.now() - 86_400_000);
	});

	test("request: paging, video age filter and safe search cookie", async () => {
		const http = new FakeHttp(BING_VIDEOS_HTML);
		const engine = new BingVideosEngine(
			testEngineConfig({ categories: ["videos"] }),
			{ market: "" },
			http,
		);
		const { results } = await engine.search(testQuery({ page: 2, timeRange: "week", safesearch: 2 }));
		expect(results).toHaveLength(3);
		const url = new URL(http.requests[0]!.url);
		expect(url.pathname).toBe("/videos/search");
		expect(url.searchParams.get("first")).toBe("41");
		expect(url.searchParams.get("qft")).toBe("+filterui:videoage-lt10080");
		expect(http.requests[0]?.init?.cookies?.SRCHHPGUSR).toBe("ADLT=STRICT");
	});
});
