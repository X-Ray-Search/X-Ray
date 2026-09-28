import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { API } from "../server/lib/api";
import { APIKeyHandler } from "../server/lib/api/utils/authHandler";
import { RateLimiter } from "../server/lib/api/utils/rateLimiter";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import { createFakeEngine, resetEngines } from "./helpers/fakeEngine";
import { seedUser } from "./helpers/seed";

let apiKey: string;

const request = (path: string, init?: RequestInit) => API.getApp().request(`/searxng${path}`, init);

beforeAll(async () => {
	await resetEngines();
	await createFakeEngine("alpha", {
		results: [
			{ url: "https://a.example/page?x=1", title: "Alpha result", content: "About alpha" },
			{ url: "https://b.example/", title: 'Beta, "quoted"', content: "Line" },
		],
		suggestions: ["alpha more"],
	});
	await createFakeEngine("broken", { fail: "error" });
	await createFakeEngine(
		"pics",
		{ results: [{ url: "https://p.example/", title: "Pic", imgSrc: "https://p.example/i.png" }] },
		{ categories: ["images"] },
	);

	const user = await seedUser("user", {}, "SearxP@ss1");
	apiKey = (await APIKeyHandler.createApiKey(user.id, "searxng")).token;
});

afterAll(async () => {
	await resetEngines();
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
	RateLimiter.reset();
});

describe("SearXNG compatible API", () => {
	test("healthz needs no key", async () => {
		const res = await request("/healthz");
		expect(await res.text()).toBe("OK");
	});

	test("requires a valid API key", async () => {
		expect((await request("/search?q=alpha&format=json")).status).toBe(401);
		expect((await request("/search?q=alpha&format=json&api_key=xray_apikey_bad:bad")).status).toBe(
			401,
		);
	});

	test("accepts the key as bearer token, header or query parameter", async () => {
		for (const [path, headers] of [
			["/search?q=alpha&format=json", { Authorization: `Bearer ${apiKey}` }],
			["/search?q=alpha&format=json", { "X-API-Key": apiKey }],
			[`/search?q=alpha&format=json&api_key=${encodeURIComponent(apiKey)}`, {}],
		] as const) {
			const res = await request(path, { headers });
			expect(res.status).toBe(200);
		}
	});

	test("returns SearXNG-shaped JSON", async () => {
		const res = await request("/search?q=alpha&format=json&pageno=1", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		const body = (await res.json()) as any;
		expect(body.query).toBe("alpha");
		expect(body.results[0]).toMatchObject({
			url: "https://a.example/page?x=1",
			title: "Alpha result",
			content: "About alpha",
			engine: "alpha",
			engines: ["alpha"],
			category: "general",
			template: "default.html",
			parsed_url: ["https", "a.example", "/page", "", "x=1", ""],
		});
		expect(body.suggestions).toEqual(["alpha more"]);
		expect(body.unresponsive_engines).toEqual([["BROKEN", "HTTP 500"]]);
	});

	test("supports POST forms, categories and engine filters", async () => {
		const res = await request("/search", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "q=cats&categories=images&format=json",
		});
		const body = (await res.json()) as any;
		expect(body.results[0]).toMatchObject({
			template: "images.html",
			img_src: "https://p.example/i.png",
		});

		const filtered = await request("/search?q=alpha&engines=alpha&format=json", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		expect(((await filtered.json()) as any).unresponsive_engines).toEqual([]);
	});

	test("csv and rss output", async () => {
		const csv = await request("/search?q=alpha&format=csv", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		expect(csv.headers.get("content-type")).toContain("text/csv");
		const text = await csv.text();
		expect(text.split("\r\n")[0]).toBe("title,url,content,host,engine,score,type");
		expect(text).toContain('"Beta, ""quoted"""');

		const rss = await request("/search?q=alpha&format=rss", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		expect(rss.headers.get("content-type")).toContain("application/rss+xml");
		expect(await rss.text()).toContain("<title>Alpha result</title>");

		expect(
			(
				await request("/search?q=alpha&format=html", { headers: { Authorization: `Bearer ${apiKey}` } })
			).status,
		).toBe(400);
		expect(
			(await request("/search?format=json", { headers: { Authorization: `Bearer ${apiKey}` } }))
				.status,
		).toBe(400);
	});

	test("config and autocompleter", async () => {
		const config = (await (
			await request("/config", { headers: { Authorization: `Bearer ${apiKey}` } })
		).json()) as any;
		expect(config.categories).toEqual(["general", "images", "news", "videos"]);
		expect(config.engines.map((e: any) => e.name)).toContain("alpha");

		const ac = (await (
			await request("/autocompleter?q=", { headers: { Authorization: `Bearer ${apiKey}` } })
		).json()) as any;
		expect(ac).toEqual(["", []]);
	});

	test("keyless access only when explicitly allowed on public instances", async () => {
		await SettingsHandler.updateInstance({ search_access: "public", searxng_api_require_key: true });
		expect((await request("/search?q=alpha")).status).toBe(401);

		await SettingsHandler.updateInstance({ searxng_api_require_key: false });
		expect((await request("/search?q=alpha")).status).toBe(200);

		await SettingsHandler.updateInstance({ search_access: "authenticated" });
		expect((await request("/search?q=alpha")).status).toBe(401);
	});

	test("can be disabled", async () => {
		await SettingsHandler.updateInstance({ searxng_api_enabled: false });
		expect(
			(await request("/search?q=alpha", { headers: { Authorization: `Bearer ${apiKey}` } })).status,
		).toBe(404);
		await SettingsHandler.updateInstance({ searxng_api_enabled: true });
	});
});
