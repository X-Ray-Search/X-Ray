import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AdminEnginesModel } from "../server/lib/api/versions/v1/routes/admin/engines/model";
import { AdminProxiesModel } from "../server/lib/api/versions/v1/routes/admin/proxies/model";
import { AdminSettingsModel } from "../server/lib/api/versions/v1/routes/admin/settings/model";
import { DB } from "../server/lib/db";
import { ProxyManager } from "../server/lib/proxy";
import { SearchEngineManager } from "../server/lib/search/manager";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import { makeAPIRequest } from "./helpers/api";
import { registerFakeEngine, resetEngines } from "./helpers/fakeEngine";
import { seedSession, seedUser } from "./helpers/seed";

let adminToken: string;
let userToken: string;

beforeAll(async () => {
	registerFakeEngine();
	await resetEngines();
	adminToken = (await seedSession((await seedUser("admin", {}, "AdminP@ss1")).id)).token;
	userToken = (await seedSession((await seedUser("user", {}, "UserP@ss1")).id)).token;
});

afterAll(async () => {
	await resetEngines();
	await DB.instance().delete(DB.Tables.proxies).run();
	await ProxyManager.reload();
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
	await SettingsHandler.updateSearchDefaults(SettingsModels.SEARCH_PREFERENCE_DEFAULTS);
	await SettingsHandler.updateAIConfig(SettingsModels.AI_DEFAULTS);
});

describe("Admin access", () => {
	test("admin routes require an admin", async () => {
		await makeAPIRequest("/v1/admin/engines", {}, 401);
		await makeAPIRequest("/v1/admin/engines", { authToken: userToken }, 403);
		await makeAPIRequest("/v1/admin/settings/instance", { authToken: userToken }, 403);
	});
});

describe("Engines", () => {
	let engineID: number;

	test("lists engine types with JSON schemas", async () => {
		const types = await makeAPIRequest<any[]>("/v1/admin/engines/types", { authToken: adminToken });
		const ddg = types.find((t) => t.type === "duckduckgo");
		expect(ddg.categories).toEqual(["general"]);
		expect(ddg.settings_schema.properties.region).toBeDefined();
		expect(types.find((t) => t.type === "brave_api").secret_fields).toEqual(["api_key"]);
	});

	test("validates type, categories, settings and slug", async () => {
		const base = {
			slug: "fake-one",
			name: "Fake",
			engine_type: "test_fake",
			categories: ["general"],
		};
		await makeAPIRequest(
			"/v1/admin/engines",
			{ method: "POST", authToken: adminToken, body: { ...base, engine_type: "nope" } },
			400,
		);
		await makeAPIRequest(
			"/v1/admin/engines",
			{ method: "POST", authToken: adminToken, body: { ...base, slug: "Bad Slug" } },
			400,
		);
		await makeAPIRequest(
			"/v1/admin/engines",
			{ method: "POST", authToken: adminToken, body: { ...base, settings: { delay_ms: "slow" } } },
			400,
		);
		await makeAPIRequest(
			"/v1/admin/engines",
			{
				method: "POST",
				authToken: adminToken,
				body: { slug: "ddg2", name: "DDG", engine_type: "duckduckgo", categories: ["images"] },
			},
			400,
		);
		await makeAPIRequest(
			"/v1/admin/engines",
			{ method: "POST", authToken: adminToken, body: { ...base, proxy_ids: [999] } },
			400,
		);
	});

	test("creates an engine and never returns secrets", async () => {
		const engine = await makeAPIRequest<AdminEnginesModel.Engine>(
			"/v1/admin/engines",
			{
				method: "POST",
				authToken: adminToken,
				body: {
					slug: "fake-one",
					name: "Fake",
					engine_type: "test_fake",
					categories: ["general", "news"],
					settings: { api_key: "super-secret", results: [{ url: "https://x.example/", title: "X" }] },
				},
				expectedBodySchema: AdminEnginesModel.Engine,
			},
			201,
		);
		engineID = engine.id;
		expect(engine.settings.api_key).toBeUndefined();
		expect(engine.secrets_set).toEqual(["api_key"]);
		expect((await SearchEngineManager.get("fake-one"))?.config.categories).toEqual([
			"general",
			"news",
		]);

		await makeAPIRequest(
			"/v1/admin/engines",
			{
				method: "POST",
				authToken: adminToken,
				body: { slug: "fake-one", name: "Dupe", engine_type: "test_fake", categories: ["general"] },
			},
			409,
		);
	});

	test("updates keep secrets that were sent empty", async () => {
		const updated = await makeAPIRequest<AdminEnginesModel.Engine>(`/v1/admin/engines/${engineID}`, {
			method: "PUT",
			authToken: adminToken,
			body: {
				weight: 2.5,
				settings: { api_key: "", results: [{ url: "https://y.example/", title: "Y" }] },
			},
			expectedBodySchema: AdminEnginesModel.Engine,
		});
		expect(updated.weight).toBe(2.5);
		expect(updated.secrets_set).toEqual(["api_key"]);
		const row = await DB.instance().select().from(DB.Tables.searchEngines).all();
		expect(row[0]?.settings.api_key).toBe("super-secret");
	});

	test("tests an engine", async () => {
		const result = await makeAPIRequest<AdminEnginesModel.TestResponse>(
			`/v1/admin/engines/${engineID}/test`,
			{
				method: "POST",
				authToken: adminToken,
				body: { query: "hello" },
				expectedBodySchema: AdminEnginesModel.TestResponse,
			},
		);
		expect(result.ok).toBe(true);
		expect(result.sample[0]?.url).toBe("https://y.example/");
	});

	test("disabling removes the engine from searches, deleting removes it entirely", async () => {
		await makeAPIRequest(`/v1/admin/engines/${engineID}`, {
			method: "PUT",
			authToken: adminToken,
			body: { enabled: false },
		});
		expect(await SearchEngineManager.get("fake-one")).toBeUndefined();

		await makeAPIRequest(`/v1/admin/engines/${engineID}`, {
			method: "DELETE",
			authToken: adminToken,
		});
		await makeAPIRequest(`/v1/admin/engines/${engineID}`, { authToken: adminToken }, 404);
	});

	test("seeds working defaults on an empty table", async () => {
		await SearchEngineManager.seedDefaultsIfEmpty();
		const engines = await makeAPIRequest<AdminEnginesModel.Engine[]>("/v1/admin/engines", {
			authToken: adminToken,
		});
		expect(engines.map((e) => e.slug)).toContain("duckduckgo");
		expect(engines.find((e) => e.slug === "mojeek")?.enabled).toBe(false);
		await resetEngines();
	});
});

describe("Proxies", () => {
	let proxyID: number;

	test("lists proxy types", async () => {
		const types = await makeAPIRequest<any[]>("/v1/admin/proxies/types", { authToken: adminToken });
		expect(types.map((t) => t.type).sort()).toEqual(["direct", "http", "socks5", "xray_gateway"]);
	});

	test("creates, masks, updates and tests a proxy", async () => {
		const proxy = await makeAPIRequest<AdminProxiesModel.Item>(
			"/v1/admin/proxies",
			{
				method: "POST",
				authToken: adminToken,
				body: {
					name: "Local SOCKS",
					proxy_type: "socks5",
					settings: { host: "127.0.0.1", port: 1, password: "pw" },
				},
				expectedBodySchema: AdminProxiesModel.Item,
			},
			201,
		);
		proxyID = proxy.id;
		expect(proxy.settings.password).toBeUndefined();
		expect(proxy.secrets_set).toEqual(["password"]);
		expect(proxy.settings.remote_dns).toBe(true);

		await makeAPIRequest(
			"/v1/admin/proxies",
			{
				method: "POST",
				authToken: adminToken,
				body: { name: "x", proxy_type: "socks5", settings: {} },
			},
			400,
		);

		const updated = await makeAPIRequest<AdminProxiesModel.Item>(`/v1/admin/proxies/${proxyID}`, {
			method: "PUT",
			authToken: adminToken,
			body: { name: "Renamed", settings: { host: "127.0.0.1", port: 1 } },
		});
		expect(updated.name).toBe("Renamed");
		expect(updated.secrets_set).toEqual(["password"]);

		// Port 1 refuses connections, so the probe fails fast.
		const result = await makeAPIRequest(`/v1/admin/proxies/${proxyID}/test`, {
			method: "POST",
			authToken: adminToken,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBeString();
	});

	test("deleting a proxy detaches it from engines and the defaults", async () => {
		const engine = await makeAPIRequest<AdminEnginesModel.Engine>(
			"/v1/admin/engines",
			{
				method: "POST",
				authToken: adminToken,
				body: {
					slug: "proxied",
					name: "Proxied",
					engine_type: "test_fake",
					categories: ["general"],
					proxy_ids: [proxyID],
				},
			},
			201,
		);
		await makeAPIRequest("/v1/admin/settings/instance", {
			method: "PUT",
			authToken: adminToken,
			body: { default_proxy_ids: [proxyID] },
		});

		const listed = await makeAPIRequest<AdminProxiesModel.Item[]>("/v1/admin/proxies", {
			authToken: adminToken,
		});
		expect(listed[0]?.used_by_engines).toEqual(["proxied"]);
		expect(listed[0]?.is_default).toBe(true);

		await makeAPIRequest(`/v1/admin/proxies/${proxyID}`, { method: "DELETE", authToken: adminToken });
		const after = await makeAPIRequest<AdminEnginesModel.Engine>(`/v1/admin/engines/${engine.id}`, {
			authToken: adminToken,
		});
		expect(after.proxy_ids).toEqual([]);
		expect((await SettingsHandler.getInstance()).default_proxy_ids).toEqual([]);
	});
});

describe("Settings", () => {
	test("instance settings update partially and validate", async () => {
		const updated = await makeAPIRequest<SettingsModels.Instance>("/v1/admin/settings/instance", {
			method: "PUT",
			authToken: adminToken,
			body: { instance_name: "My X-Ray", search_access: "public" },
			expectedBodySchema: AdminSettingsModel.Instance.Response,
		});
		expect(updated.instance_name).toBe("My X-Ray");
		expect(updated.searxng_api_enabled).toBe(true);
		await makeAPIRequest(
			"/v1/admin/settings/instance",
			{ method: "PUT", authToken: adminToken, body: { search_access: "everyone" } },
			400,
		);
		await SettingsHandler.updateInstance({ search_access: "authenticated" });
	});

	test("search defaults", async () => {
		const updated = await makeAPIRequest<SettingsModels.SearchPreferences>(
			"/v1/admin/settings/search-defaults",
			{
				method: "PUT",
				authToken: adminToken,
				body: { safesearch: 2, disabled_instant_answers: ["weather"] },
			},
		);
		expect(updated.safesearch).toBe(2);
		expect(updated.autocomplete).toBe("duckduckgo");
	});

	test("the AI key is write-only", async () => {
		const set = await makeAPIRequest<SettingsModels.AIConfigPublic>("/v1/admin/settings/ai", {
			method: "PUT",
			authToken: adminToken,
			body: { enabled: true, base_url: "http://127.0.0.1:1/v1", model: "m", api_key: "sk-123" },
			expectedBodySchema: AdminSettingsModel.AI.Response,
		});
		expect(set.api_key_set).toBe(true);
		expect((set as any).api_key).toBeUndefined();

		const kept = await makeAPIRequest<SettingsModels.AIConfigPublic>("/v1/admin/settings/ai", {
			method: "PUT",
			authToken: adminToken,
			body: { temperature: 0.7 },
		});
		expect(kept.api_key_set).toBe(true);
		expect((await SettingsHandler.getAIConfig()).api_key).toBe("sk-123");

		const cleared = await makeAPIRequest<SettingsModels.AIConfigPublic>("/v1/admin/settings/ai", {
			method: "PUT",
			authToken: adminToken,
			body: { api_key: null },
		});
		expect(cleared.api_key_set).toBe(false);

		const test = await makeAPIRequest("/v1/admin/settings/ai/test", {
			method: "POST",
			authToken: adminToken,
			body: {},
		});
		expect(test.ok).toBe(false);
	});

	test("bang dataset status is readable", async () => {
		const status = await makeAPIRequest("/v1/admin/bangs/dataset", { authToken: adminToken });
		expect(status.source_url).toBe("https://duckduckgo.com/bang.js");
	});
});
