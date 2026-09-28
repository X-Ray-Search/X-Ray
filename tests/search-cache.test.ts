import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { AdminEnginesModel } from "../server/lib/api/versions/v1/routes/admin/engines/model";
import type { AdminSettingsModel } from "../server/lib/api/versions/v1/routes/admin/settings/model";
import { SearchModel } from "../server/lib/api/versions/v1/routes/search/model";
import { DB } from "../server/lib/db";
import { SearchAggregator } from "../server/lib/search/aggregator";
import { SearchEngineRegistry } from "../server/lib/search/engines";
import { EngineError } from "../server/lib/search/errors";
import { EngineHealth } from "../server/lib/search/health";
import { EngineHttp } from "../server/lib/search/http";
import { SearchEngineManager } from "../server/lib/search/manager";
import { EngineRunCache } from "../server/lib/search/runCache";
import { EngineThrottle } from "../server/lib/search/throttle";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import { makeAPIRequest } from "./helpers/api";
import { testQuery } from "./helpers/engineConfig";
import { createFakeEngine, deleteEngine, FakeEngine, resetEngines } from "./helpers/fakeEngine";
import { seedSession, seedUser } from "./helpers/seed";

let token: string;
let adminToken: string;

async function search(query: string, extra: Record<string, string> = {}) {
	return makeAPIRequest<SearchModel.Search.Response>(
		`/v1/search?${new URLSearchParams({ q: query, ...extra })}`,
		{ authToken: token, expectedBodySchema: SearchModel.Search.Response },
	);
}

const statusOf = (data: SearchModel.Search.Response, slug: string) =>
	data.engines.find((e) => e.slug === slug);

/** Run engines straight through the aggregator with a cache policy. */
async function aggregate(query: string, slugs: string[], policy: EngineRunCache.Policy) {
	const engines = await Promise.all(slugs.map((slug) => SearchEngineManager.get(slug)));
	return SearchAggregator.run(
		testQuery({ query }),
		engines.filter((e) => e !== undefined),
		{ cache: policy },
	);
}

const result = (n: number) => ({ url: `https://r${n}.example/`, title: `Result ${n}` });

beforeAll(async () => {
	token = (await seedSession((await seedUser("user", {}, "CacheP@ss1")).id)).token;
	adminToken = (await seedSession((await seedUser("admin", {}, "AdminP@ss1")).id)).token;
	await resetEngines();
});

beforeEach(async () => {
	await resetEngines();
	EngineRunCache.resetStats();
	FakeEngine.calls.length = 0;
});

afterAll(async () => {
	await resetEngines();
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
});

describe("Engine run cache", () => {
	test("caches every engine on its own, shared across engine selections", async () => {
		await createFakeEngine("alpha", { results: [result(1)] });
		await createFakeEngine("beta", { results: [result(2)] });

		const first = await search("per engine");
		expect(first.cached).toBe(false);
		expect(first.engines.map((e) => e.cached)).toEqual([null, null]);

		// A different engine selection reuses the runs that already exist.
		const onlyBeta = await search("per engine", { engines: "beta" });
		expect(onlyBeta.cached).toBe(true);
		expect(statusOf(onlyBeta, "beta")?.cached).toBe("fresh");
		expect(onlyBeta.results.map((r) => r.url)).toEqual(["https://r2.example/"]);

		const again = await search("  PER   engine ");
		expect(again.cached).toBe(true);
		expect(again.results).toHaveLength(2);
		expect(FakeEngine.callsOf("alpha")).toBe(1);
		expect(FakeEngine.callsOf("beta")).toBe(1);
		expect(EngineRunCache.stats().hits).toBe(3);
	});

	test("joins identical requests that are already running", async () => {
		await createFakeEngine("slowpoke", { results: [result(1)] });
		// Hold the engine until every request has looked up the cache and gone to it — a fixed
		// delay lets a late request on a slow machine find the finished run as a plain cache hit.
		let release!: () => void;
		FakeEngine.overrides.set("slowpoke", { gate: new Promise((resolve) => (release = resolve)) });

		const requests = Promise.all([search("joined"), search("joined"), search("joined")]);
		while (EngineRunCache.stats().misses < 3) await Bun.sleep(5);
		release();
		const [a, b, c] = await requests;
		expect(FakeEngine.callsOf("slowpoke")).toBe(1);
		for (const data of [a, b, c]) expect(data.results).toHaveLength(1);
		expect(EngineRunCache.stats().coalesced).toBe(2);
	});

	test("serves stale results while an engine is blocked", async () => {
		await createFakeEngine("flaky", { results: [result(1)] });
		const policy = { freshMs: 1, staleMs: 60_000 };

		expect((await aggregate("stale", ["flaky"], policy)).results).toHaveLength(1);
		await Bun.sleep(5);

		FakeEngine.overrides.set("flaky", { fail: "blocked" });
		const blocked = await aggregate("stale", ["flaky"], policy);
		expect(blocked.engines[0]).toMatchObject({ status: "blocked", cached: "stale", results: 1 });
		expect(blocked.results.map((r) => r.url)).toEqual(["https://r1.example/"]);

		// Now suspended: no request at all, still the stale results.
		const suspended = await aggregate("stale", ["flaky"], policy);
		expect(suspended.engines[0]).toMatchObject({ status: "suspended", cached: "stale" });
		expect(FakeEngine.callsOf("flaky")).toBe(2);
		expect(EngineRunCache.stats().stale_served).toBe(2);
		EngineHealth.reset("flaky");
	});

	test("remembers failures briefly instead of asking again", async () => {
		await createFakeEngine("broken", { fail: "error" });
		const first = await search("fails", { engines: "broken" });
		expect(statusOf(first, "broken")?.status).toBe("error");

		const second = await search("fails", { engines: "broken" });
		expect(statusOf(second, "broken")?.status).toBe("error");
		expect(FakeEngine.callsOf("broken")).toBe(1);
		EngineHealth.reset("broken");
	});

	test("empty answers never replace cached results", async () => {
		const policy = { freshMs: 60_000, staleMs: 60_000 };
		const key = "k-empty";
		EngineRunCache.store(key, "x", { results: [{ url: "https://x.example/", title: "X" }] }, policy);
		EngineRunCache.store(key, "x", { results: [] }, policy);
		expect(EngineRunCache.lookup(key).fresh?.response.results).toHaveLength(1);

		// An empty answer on its own is only remembered for a minute and never as `fresh`.
		EngineRunCache.store("k-empty-2", "x", { results: [] }, policy);
		const lookup = EngineRunCache.lookup("k-empty-2");
		expect(lookup.fresh).toBeNull();
		expect(lookup.recent?.error).toBeNull();

		// Answers an engine marks as not cacheable (skipped pages) are not stored at all.
		EngineRunCache.store("k-skip", "x", { results: [], cacheable: false }, policy);
		expect(EngineRunCache.lookup("k-skip").recent).toBeNull();
	});

	test("keeps runs on disk across a memory wipe", async () => {
		await createFakeEngine("durable", { results: [result(1)] });
		EngineRunCache.configure({ persistent: true });

		await search("persisted");
		// Writes are batched per tick.
		await Bun.sleep(20);
		EngineRunCache.clearMemory();

		const again = await search("persisted");
		expect(again.cached).toBe(true);
		expect(FakeEngine.callsOf("durable")).toBe(1);
		expect(EngineRunCache.stats().disk_entries).toBeGreaterThan(0);
	});

	test("a TTL of 0 disables caching", async () => {
		await SettingsHandler.updateInstance({ search_cache_ttl_minutes: 0 });
		await createFakeEngine("uncached", { results: [result(1)] });
		await search("no cache");
		expect((await search("no cache")).cached).toBe(false);
		expect(FakeEngine.callsOf("uncached")).toBe(2);
		await SettingsHandler.updateInstance({ search_cache_ttl_minutes: 60 });
	});
});

describe("Rate limits and fallbacks", () => {
	test("engines over their rate limit are skipped", async () => {
		await createFakeEngine("limited", { results: [result(1)] }, { rate_limit_per_minute: 1 });
		await createFakeEngine("free", { results: [result(2)] });

		expect(statusOf(await search("budget one"), "limited")?.status).toBe("ok");
		const second = await search("budget two");
		expect(statusOf(second, "limited")?.status).toBe("throttled");
		expect(statusOf(second, "limited")?.error).toContain("1 requests per minute");
		expect(FakeEngine.callsOf("limited")).toBe(1);
		expect(second.results.map((r) => r.url)).toEqual(["https://r2.example/"]);
	});

	test("fallback engines only run when too few regular engines answer", async () => {
		await createFakeEngine("one", { results: [result(1)] });
		await createFakeEngine("two", { results: [result(2)] });
		await createFakeEngine("spare", { results: [result(3)] }, { fallback: true });

		const healthy = await search("fallback healthy");
		expect(healthy.engines.map((e) => e.slug)).toEqual(["one", "two"]);
		expect(FakeEngine.callsOf("spare")).toBe(0);

		// `two` fails unexpectedly → the fallback runs in a second wave.
		FakeEngine.overrides.set("two", { fail: "blocked" });
		const degraded = await search("fallback degraded");
		expect(statusOf(degraded, "spare")).toMatchObject({ status: "ok", fallback: true });
		expect(degraded.results.map((r) => r.url).sort()).toEqual([
			"https://r1.example/",
			"https://r3.example/",
		]);

		// `two` is suspended now → the fallback is part of the first wave.
		const started = performance.now();
		const suspended = await search("fallback suspended");
		expect(performance.now() - started).toBeLessThan(1000);
		expect(statusOf(suspended, "two")?.status).toBe("suspended");
		expect(statusOf(suspended, "spare")?.status).toBe("ok");
		expect(FakeEngine.callsOf("spare")).toBe(2);
		EngineHealth.reset("two");
	});

	test("`min_healthy_engines` sets how many engines must answer", async () => {
		await createFakeEngine("solo", { results: [result(1)] });
		await createFakeEngine("backup", { results: [result(2)] }, { fallback: true });

		await SettingsHandler.updateInstance({ min_healthy_engines: 1 });
		expect((await search("need one")).engines.map((e) => e.slug)).toEqual(["solo"]);

		await SettingsHandler.updateInstance({ min_healthy_engines: 2 });
		expect((await search("need two")).engines.map((e) => e.slug)).toEqual(["solo", "backup"]);
	});

	test("with only fallback engines, they are the regular ones", async () => {
		await createFakeEngine("lonely", { results: [result(1)] }, { fallback: true });
		expect((await search("only fallbacks")).results).toHaveLength(1);
	});

	test("`Retry-After` extends a suspension", () => {
		expect(EngineHttp.retryAfterMs("120")).toBe(120_000);
		expect(
			EngineHttp.retryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", Date.UTC(2015, 9, 21, 7, 27)),
		).toBe(60_000);
		expect(EngineHttp.retryAfterMs("soon")).toBeUndefined();

		EngineHealth.recordFailure("patient", new EngineError("blocked", "429", 20 * 60_000));
		const until = EngineHealth.snapshot("patient").suspended_until ?? 0;
		expect(until - Date.now()).toBeGreaterThan(19 * 60_000);
		EngineHealth.reset("patient");
	});

	test("the throttle window rolls", () => {
		const now = 1_000_000;
		expect(EngineThrottle.tryAcquire("roll", 2, now)).toBe(true);
		expect(EngineThrottle.tryAcquire("roll", 2, now + 1000)).toBe(true);
		expect(EngineThrottle.tryAcquire("roll", 2, now + 2000)).toBe(false);
		expect(EngineThrottle.retryInMs("roll", 2, now + 2000)).toBe(58_000);
		expect(EngineThrottle.tryAcquire("roll", 2, now + 60_001)).toBe(true);
		EngineThrottle.reset("roll");
	});
});

describe("Default engines", () => {
	const slugs = async () =>
		(await DB.instance().select({ slug: DB.Tables.searchEngines.slug }).from(DB.Tables.searchEngines))
			.map((row) => row.slug)
			.sort();

	test("an upgrade adds the new defaults but not engines an admin deleted", async () => {
		// An instance seeded before versioned seeding, whose admin deleted Mojeek.
		const v1 = SearchEngineManager.DEFAULT_ENGINES.filter((e) => (e.since ?? 1) === 1);
		await DB.instance()
			.delete(DB.Tables.metadata)
			.where(eq(DB.Tables.metadata.key, "engine_defaults"));
		for (const engine of v1.filter((e) => e.slug !== "mojeek")) {
			await createFakeEngine(engine.slug, {});
		}

		await SearchEngineManager.seedDefaults();
		const after = await slugs();
		expect(after).not.toContain("mojeek");
		expect(after).toContain("startpage");
		expect(after).toHaveLength(SearchEngineManager.DEFAULT_ENGINES.length - 1);

		const startpage = await DB.instance()
			.select()
			.from(DB.Tables.searchEngines)
			.where(eq(DB.Tables.searchEngines.slug, "startpage"))
			.get();
		expect(startpage).toMatchObject({ fallback: true, rate_limit_per_minute: 12, timeout_ms: 6000 });

		// Seeding again is a no-op.
		await deleteEngine("startpage");
		await SearchEngineManager.seedDefaults();
		expect(await slugs()).not.toContain("startpage");
	});

	test("every default engine type is registered", () => {
		for (const engine of SearchEngineManager.DEFAULT_ENGINES) {
			expect(SearchEngineRegistry.get(engine.type)?.definition.type).toBe(engine.type);
		}
	});
});

describe("Admin", () => {
	test("engine updates keep the fields they don't send", async () => {
		const row = await createFakeEngine("keeper", {}, { weight: 0.5, rate_limit_per_minute: 7 });
		const updated = await makeAPIRequest<AdminEnginesModel.Engine>(`/v1/admin/engines/${row.id}`, {
			method: "PUT",
			authToken: adminToken,
			body: { enabled: false },
		});
		expect(updated).toMatchObject({ enabled: false, weight: 0.5, rate_limit_per_minute: 7 });
		await deleteEngine("keeper");
	});

	test("new engines get the type's suggested rate limit", async () => {
		const created = await makeAPIRequest<AdminEnginesModel.Engine>(
			"/v1/admin/engines",
			{
				method: "POST",
				authToken: adminToken,
				body: { slug: "mojeek-test", name: "Mojeek", engine_type: "mojeek", categories: ["general"] },
			},
			201,
		);
		expect(created.rate_limit_per_minute).toBe(10);
		expect(created.fallback).toBe(false);
		await deleteEngine("mojeek-test");
	});

	test("cache statistics and clearing", async () => {
		await createFakeEngine("counted", { results: [result(1)] });
		await search("stats");
		await search("stats");

		type Stats = z.infer<typeof AdminSettingsModel.CacheStats>;
		const stats = await makeAPIRequest<Stats>("/v1/admin/settings/cache", { authToken: adminToken });
		expect(stats).toMatchObject({ hits: 1, misses: 1 });
		expect(stats.memory_entries).toBeGreaterThan(0);

		await makeAPIRequest("/v1/admin/settings/cache/clear", { method: "POST", authToken: adminToken });
		expect((await search("stats")).cached).toBe(false);
	});
});
