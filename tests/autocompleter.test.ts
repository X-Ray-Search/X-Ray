import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp, toWebHandler } from "h3";
import { RateLimiter } from "../server/lib/api/utils/rateLimiter";
import { SESSION_COOKIE_NAME } from "../server/lib/api/versions/v1/middleware/auth";
import { AutocompleteService } from "../server/lib/search/autocomplete";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import autocompleter from "../server/routes/autocompleter";
import { seedSession, seedUser } from "./helpers/seed";

/** The legacy root-level `/autocompleter` Nitro route, run through h3 like Nitro does. */
const handler = toWebHandler(createApp().use("/autocompleter", autocompleter));
const request = (path: string, init?: RequestInit) =>
	handler(new Request(`http://localhost:12418${path}`, init));

let cookie: string;

beforeAll(async () => {
	const user = await seedUser("user", {}, "AutocompleteP@ss1");
	cookie = `${SESSION_COOKIE_NAME}=${(await seedSession(user.id)).token}`;

	// Pre-seed the suggestion cache so no provider is contacted.
	(AutocompleteService as any).cache.set("duckduckgo|all|linux", ["linux mint", "linux kernel"]);
	await SettingsHandler.updateInstance({ search_access: "public" });
});

afterAll(async () => {
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
	RateLimiter.reset();
});

describe("Legacy /autocompleter", () => {
	test("answers GET in the OpenSearch suggestions format", async () => {
		const res = await request("/autocompleter?q=linux");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/x-suggestions+json");
		expect(await res.json()).toEqual(["linux", ["linux mint", "linux kernel"]]);
	});

	test("accepts the query as a POST form body", async () => {
		const multipart = new FormData();
		multipart.set("q", "linux");
		for (const body of [new URLSearchParams({ q: "linux" }), multipart]) {
			const res = await request("/autocompleter", { method: "POST", body });
			expect(await res.json()).toEqual(["linux", ["linux mint", "linux kernel"]]);
		}
	});

	test("an empty or missing query yields no suggestions", async () => {
		expect(await (await request("/autocompleter?q=")).json()).toEqual(["", []]);
		expect(await (await request("/autocompleter")).json()).toEqual(["", []]);
	});

	test("private instances need the session cookie", async () => {
		await SettingsHandler.updateInstance({ search_access: "authenticated" });
		expect(await (await request("/autocompleter?q=linux")).json()).toEqual(["linux", []]);
		expect(
			await (await request("/autocompleter?q=linux", { headers: { Cookie: cookie } })).json(),
		).toEqual(["linux", ["linux mint", "linux kernel"]]);
		await SettingsHandler.updateInstance({ search_access: "public" });
	});

	test("rejects other methods", async () => {
		const res = await request("/autocompleter?q=linux", { method: "PUT" });
		expect(res.status).toBe(405);
		expect(res.headers.get("allow")).toBe("GET, HEAD, POST");
	});
});
