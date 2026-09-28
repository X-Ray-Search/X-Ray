import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { APIKeyHandler } from "../server/lib/api/utils/authHandler";
import { RateLimiter } from "../server/lib/api/utils/rateLimiter";
import { InstanceModel } from "../server/lib/api/versions/v1/routes/instance/model";
import { SearchModel } from "../server/lib/api/versions/v1/routes/search/model";
import { BangService } from "../server/lib/bangs";
import { DB } from "../server/lib/db";
import { EngineHealth } from "../server/lib/search/health";
import { ImageProxy } from "../server/lib/search/imageProxy";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import { makeAPIRequest } from "./helpers/api";
import { createFakeEngine, deleteEngine, resetEngines } from "./helpers/fakeEngine";
import { seedSession, seedUser } from "./helpers/seed";

let token: string;
let userID: number;

/** `authToken: null` searches anonymously. */
async function search(
	query: string,
	extra: Record<string, string> = {},
	authToken: string | null = token,
	code?: number,
) {
	return makeAPIRequest<SearchModel.Search.Response>(
		`/v1/search?${new URLSearchParams({ q: query, ...extra })}`,
		{
			authToken: authToken ?? undefined,
			expectedBodySchema: code ? undefined : SearchModel.Search.Response,
		},
		code,
	);
}

beforeAll(async () => {
	const user = await seedUser("user", {}, "SearchP@ss1");
	userID = user.id;
	token = (await seedSession(user.id)).token;

	await resetEngines();
	await createFakeEngine("alpha", {
		results: [
			{ url: "https://a.example/", title: "A", content: "short" },
			{ url: "https://www.b.example/page/?utm_source=x", title: "B", content: "b" },
			{ url: "https://c.example/", title: "C" },
		],
		suggestions: ["alpha suggestion"],
	});
	await createFakeEngine("beta", {
		results: [
			{ url: "http://b.example/page", title: "B (beta)", content: "a much longer description of B" },
			{ url: "https://d.example/", title: "D" },
		],
	});
	await createFakeEngine(
		"pictures",
		{
			results: [
				{
					url: "https://img.example/page",
					title: "Cat",
					imgSrc: "https://img.example/cat.jpg",
					thumbnail: "https://img.example/cat-t.jpg",
				},
			],
		},
		{ categories: ["images"] },
	);

	await DB.instance()
		.insert(DB.Tables.ddgBangs)
		.values([
			{
				trigger: "w",
				name: "Wikipedia",
				domain: "en.wikipedia.org",
				url_template: "https://en.wikipedia.org/wiki/Special:Search?search={{{s}}}",
				relevance: 1000,
			},
			{
				trigger: "wa",
				name: "Wolfram Alpha",
				domain: "www.wolframalpha.com",
				url_template: "https://www.wolframalpha.com/input/?i={{{s}}}",
				relevance: 500,
			},
			{
				trigger: "g",
				name: "Google",
				domain: "www.google.com",
				url_template: "https://www.google.com/search?q={{{s}}}",
				relevance: 2000,
			},
		]);
	await BangService.load();
});

afterAll(async () => {
	await resetEngines();
	await DB.instance().delete(DB.Tables.ddgBangs).run();
	await DB.instance().delete(DB.Tables.bangs).run();
	await BangService.load();
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
	await SettingsHandler.updateSearchDefaults(SettingsModels.SEARCH_PREFERENCE_DEFAULTS);
	await SettingsHandler.updateAIConfig(SettingsModels.AI_DEFAULTS);
	RateLimiter.reset();
});

beforeEach(() => RateLimiter.reset());

describe("Search access", () => {
	test("anonymous searches are rejected on authenticated instances", async () => {
		await search("test", {}, null, 401);
		const info = await makeAPIRequest("/v1/instance", {
			expectedBodySchema: InstanceModel.Info.Response,
		});
		expect(info.can_search).toBe(false);
		expect(info.search_access).toBe("authenticated");
	});

	test("sessions and API keys can search", async () => {
		const byToken = await search("test");
		expect(byToken.results.length).toBeGreaterThan(0);

		const key = await APIKeyHandler.createApiKey(userID, "search test");
		const byKey = await search("test", {}, key.token);
		expect(byKey.results.length).toBe(byToken.results.length);
	});

	test("public instances allow anonymous searches with a rate limit", async () => {
		await SettingsHandler.updateInstance({
			search_access: "public",
			public_rate_limit_per_minute: 2,
		});
		const info = await makeAPIRequest("/v1/instance", {
			expectedBodySchema: InstanceModel.Info.Response,
		});
		expect(info.can_search).toBe(true);

		const headers = { "x-xray-client-ip": "198.51.100.23" };
		for (let i = 0; i < 2; i++) {
			await makeAPIRequest("/v1/search?q=public", { additionalOptions: { headers } }, 200);
		}
		await makeAPIRequest("/v1/search?q=public", { additionalOptions: { headers } }, 429);
		// Authenticated users are not rate limited.
		await search("public");

		await SettingsHandler.updateInstance({
			search_access: "authenticated",
			public_rate_limit_per_minute: 60,
		});
	});

	test("validates parameters", async () => {
		await makeAPIRequest("/v1/search?q=", { authToken: token }, 400);
		await makeAPIRequest("/v1/search?q=x&category=music", { authToken: token }, 400);
		await makeAPIRequest("/v1/search?q=x&page=0", { authToken: token }, 400);
	});
});

describe("Aggregation", () => {
	test("merges duplicates across engines and ranks by summed score", async () => {
		const data = await search("merge");
		expect(data.results.map((r) => r.title)).toEqual(["B", "A", "D", "C"]);

		const b = data.results[0]!;
		expect(b.engines.sort()).toEqual(["alpha", "beta"]);
		expect(b.score).toBeCloseTo(1.5, 5);
		expect(b.content).toBe("a much longer description of B");
		// Tracking parameters are stripped.
		expect(b.url).toBe("https://www.b.example/page/");

		expect(data.engines.map((e) => e.status)).toEqual(["ok", "ok"]);
		expect(data.suggestions).toEqual(["alpha suggestion"]);
	});

	test("caches result pages", async () => {
		expect((await search("cache-me")).cached).toBe(false);
		expect((await search("cache-me")).cached).toBe(true);
	});

	test("`engines` restricts and `disabled_engines` excludes", async () => {
		const only = await search("restrict", { engines: "beta" });
		expect(only.engines.map((e) => e.slug)).toEqual(["beta"]);

		await SettingsHandler.setUserOverrides(userID, { disabled_engines: ["alpha"] });
		const without = await search("disabled");
		expect(without.engines.map((e) => e.slug)).toEqual(["beta"]);
		await SettingsHandler.setUserOverrides(userID, {});
	});

	test("blocked engines get suspended", async () => {
		await createFakeEngine("blocker", { fail: "blocked" });
		const first = await search("blocked-1", { engines: "blocker" });
		expect(first.engines[0]?.status).toBe("blocked");
		const second = await search("blocked-2", { engines: "blocker" });
		expect(second.engines[0]?.status).toBe("suspended");
		EngineHealth.reset("blocker");
		await deleteEngine("blocker");
	});

	test("slow engines time out without stalling the search", async () => {
		await createFakeEngine(
			"sloth",
			{ delay_ms: 5000, results: [{ url: "https://slow.example/", title: "slow" }] },
			{ timeout_ms: 500 },
		);
		const started = performance.now();
		const data = await search("slow", { engines: "sloth,alpha" });
		expect(performance.now() - started).toBeLessThan(2500);
		expect(data.engines.find((e) => e.slug === "sloth")?.status).toBe("timeout");
		expect(data.results.some((r) => r.url.includes("a.example"))).toBe(true);
		EngineHealth.reset("sloth");
		await deleteEngine("sloth");
	});

	test("instant answers are attached to general searches", async () => {
		const data = await search("12 * 12");
		expect(data.instant_answers.find((a) => a.provider === "calculator")?.data.result).toBe("144");
	});
});

describe("Bangs", () => {
	test("redirects for DuckDuckGo bangs in any position", async () => {
		for (const query of ["!w linux kernel", "linux kernel !w", "linux !W kernel"]) {
			const data = await search(query);
			expect(data.redirect?.url).toBe(
				"https://en.wikipedia.org/wiki/Special:Search?search=linux%20kernel",
			);
			expect(data.redirect?.bang.source).toBe("ddg");
			expect(data.results).toHaveLength(0);
		}
	});

	test("a bang without a query opens the site", async () => {
		expect((await search("!g")).redirect?.url).toBe("https://www.google.com");
	});

	test("internal bangs switch the category", async () => {
		const data = await search("!i cats");
		expect(data.category).toBe("images");
		expect(data.category_redirect).toBe("images");
		expect(data.query).toBe("cats");
		expect(data.results[0]?.title).toBe("Cat");
	});

	test("unknown bangs fall through to a normal search", async () => {
		const data = await search("!doesnotexist merge");
		expect(data.redirect).toBeNull();
		expect(data.results.length).toBeGreaterThan(0);
	});

	test("feeling lucky jumps to the first result", async () => {
		expect((await search("! merge")).redirect?.url).toBe("https://www.b.example/page/");
	});

	test("personal bangs beat instance bangs beat DuckDuckGo bangs", async () => {
		const admin = await seedUser("admin", {}, "AdminBangP@ss1");
		const adminToken = (await seedSession(admin.id)).token;

		await makeAPIRequest(
			"/v1/admin/bangs",
			{
				method: "POST",
				authToken: adminToken,
				body: { trigger: "w", name: "Instance Wiki", url_template: "https://wiki.example/?q=%s" },
			},
			201,
		);
		expect((await search("!w x")).redirect?.url).toBe("https://wiki.example/?q=x");

		const personal = await makeAPIRequest(
			"/v1/account/bangs",
			{
				method: "POST",
				authToken: token,
				body: { trigger: "!W", name: "My Wiki", url_template: "https://my.example/{{{s}}}" },
			},
			201,
		);
		expect(personal.trigger).toBe("w");
		expect((await search("!w x")).redirect?.url).toBe("https://my.example/x");

		await makeAPIRequest(
			"/v1/account/bangs",
			{
				method: "POST",
				authToken: token,
				body: { trigger: "w", name: "Dupe", url_template: "https://dupe.example/{{{s}}}" },
			},
			409,
		);
		await makeAPIRequest(`/v1/account/bangs/${personal.id}`, { method: "DELETE", authToken: token });
		expect((await search("!w x")).redirect?.url).toBe("https://wiki.example/?q=x");
	});

	test("bangs can be disabled per user", async () => {
		await SettingsHandler.setUserOverrides(userID, { bangs_enabled: false });
		expect((await search("!g merge")).redirect).toBeNull();
		await SettingsHandler.setUserOverrides(userID, { ddg_bangs_enabled: false });
		expect((await search("!g merge")).redirect).toBeNull();
		expect((await search("!i merge")).category).toBe("images");
		await SettingsHandler.setUserOverrides(userID, {});
	});

	test("autocomplete suggests bangs for a `!` token", async () => {
		const data = await makeAPIRequest("/v1/search/autocomplete?q=linux%20!w", {
			authToken: token,
			expectedBodySchema: SearchModel.Autocomplete.Response,
		});
		expect(data.bangs.map((b) => b.trigger).slice(0, 2)).toEqual(["w", "wa"]);
		expect(data.suggestions).toEqual([]);
	});
});

describe("Media proxy", () => {
	test("rewrites thumbnails to signed proxy URLs", async () => {
		const data = await search("cats", { category: "images" });
		const thumbnail = data.results[0]?.thumbnail ?? "";
		expect(thumbnail.startsWith("/api/v1/proxy/image?")).toBe(true);
		const params = new URL(thumbnail, "http://x").searchParams;
		expect(params.get("url")).toBe("https://img.example/cat-t.jpg");
		expect(await ImageProxy.verify(params.get("url")!, params.get("sig")!)).toBe(true);

		await SettingsHandler.setUserOverrides(userID, { image_proxy: false });
		const direct = await search("cats", { category: "images" });
		expect(direct.results[0]?.thumbnail).toBe("https://img.example/cat-t.jpg");
		await SettingsHandler.setUserOverrides(userID, {});
	});

	test("rejects bad signatures and private targets", async () => {
		const res = await makeAPIRequest(
			"/v1/proxy/image?url=https://img.example/x.jpg&sig=00000000000000000000000000000000",
			{},
			403,
		);
		expect(res).toBeNull();

		const internal = await ImageProxy.sign("http://127.0.0.1:1/secret.png");
		await makeAPIRequest(internal.replace("/api", ""), {}, 403);
	});
});

describe("AI answers", () => {
	let fakeLLM: ReturnType<typeof Bun.serve>;
	let lastRequest: any = null;

	beforeAll(() => {
		fakeLLM = Bun.serve({
			port: 0,
			async fetch(req) {
				lastRequest = await req.json();
				if (!lastRequest.stream) {
					return Response.json({ choices: [{ message: { content: "B is the answer [1]." } }] });
				}
				const chunks = ["B is ", "the answer ", "[1]."].map(
					(text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
				);
				return new Response(`${chunks.join("")}data: [DONE]\n\n`, {
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		});
	});

	afterAll(() => fakeLLM.stop(true));

	test("is unavailable until configured", async () => {
		const data = await search("merge");
		expect(data.ai_available).toBe(false);
		await makeAPIRequest(
			"/v1/search/ai",
			{ method: "POST", authToken: token, body: { q: "merge" } },
			403,
		);
	});

	test("answers from the search results (JSON and SSE)", async () => {
		await SettingsHandler.updateAIConfig({
			enabled: true,
			base_url: `http://127.0.0.1:${fakeLLM.port}/v1`,
			model: "test-model",
			api_key: "sk-test",
		});
		expect((await search("merge")).ai_available).toBe(true);

		const answer = await makeAPIRequest<SearchModel.AI.Response>("/v1/search/ai", {
			method: "POST",
			authToken: token,
			body: { q: "merge", stream: false },
			expectedBodySchema: SearchModel.AI.Response,
		});
		expect(answer.answer).toBe("B is the answer [1].");
		expect(answer.sources[0]?.url).toBe("https://www.b.example/page/");
		// Only admins see which model answered.
		expect(answer.model).toBeNull();
		expect(lastRequest.model).toBe("test-model");
		expect(lastRequest.messages[1].content).toContain("[1] B");

		const { API } = await import("../server/lib/api");
		const res = await API.getApp().request("/v1/search/ai", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ q: "merge" }),
		});
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain("event: sources");
		const text = [...body.matchAll(/event: delta\ndata: (.+)\n/g)]
			.map((m) => JSON.parse(m[1]!).text)
			.join("");
		expect(text).toBe("B is the answer [1].");
		expect(body).toContain('event: done\ndata: {"model":null}');
	});

	test("shows the model to admins", async () => {
		const admin = await seedUser("admin");
		const answer = await makeAPIRequest<SearchModel.AI.Response>("/v1/search/ai", {
			method: "POST",
			authToken: (await seedSession(admin.id)).token,
			body: { q: "merge", stream: false },
			expectedBodySchema: SearchModel.AI.Response,
		});
		expect(answer.model).toBe("test-model");
	});

	test("need sign-in, also on public instances", async () => {
		await SettingsHandler.updateInstance({ search_access: "public" });
		expect((await search("merge", {}, null)).ai_available).toBe(false);
		await makeAPIRequest("/v1/search/ai", { method: "POST", body: { q: "merge" } }, 401);
		await SettingsHandler.updateInstance({ search_access: "authenticated" });
	});

	test("respects the user's ai_mode", async () => {
		await SettingsHandler.setUserOverrides(userID, { ai_mode: "off" });
		expect((await search("merge")).ai_available).toBe(false);
		await makeAPIRequest(
			"/v1/search/ai",
			{ method: "POST", authToken: token, body: { q: "merge" } },
			403,
		);
		await SettingsHandler.setUserOverrides(userID, {});
	});
});
