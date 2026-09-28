import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { API } from "../server/lib/api";
import { AuthHandler, AuthUtils, SessionHandler } from "../server/lib/api/utils/authHandler";
import { AccountModel } from "../server/lib/api/versions/v1/routes/account/model";
import { AccountPreferencesModel } from "../server/lib/api/versions/v1/routes/account/preferences/model";
import { AuthModel } from "../server/lib/api/versions/v1/routes/auth/model";
import { hashResetToken } from "../server/lib/api/versions/v1/routes/auth/reset-password";
import { DB } from "../server/lib/db";
import { SettingsHandler } from "../server/lib/settings";
import { AppConstants } from "../server/lib/utils/constants";
import { makeAPIRequest } from "./helpers/api";
import { type SeededSession, type SeededUser, seedSession, seedUser } from "./helpers/seed";

let testUser: SeededUser;
let testAdmin: SeededUser;

beforeAll(async () => {
	testUser = await seedUser("user", { username: "testuser" }, "UserP@ss1");
	testAdmin = await seedUser("admin", { username: "testadmin" }, "AdminP@ss1");
});

describe("Global API routes", async () => {
	test("GET /health returns API health payload", async () => {
		const res = await API.getApp().request("/health");
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.success).toBe(true);
		expect(body.message).toBe(`${AppConstants.APP_NAME} API is running`);
	});

	test("GET / redirects to the latest docs while docs are enabled", async () => {
		const res = await API.getApp().request("/");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/docs/v1");
	});
});

describe("Auth routes and access checks", async () => {
	let session_token: string;

	test("POST /v1/auth/login authenticates and creates session", async () => {
		const data = await makeAPIRequest("/v1/auth/login", {
			method: "POST",
			body: { username: testUser.username, password: testUser.password },
			expectedBodySchema: AuthModel.Login.Response,
		});

		expect(data.token.startsWith(`${AppConstants.APP_KEYS_PREFIX}_sess_`)).toBe(true);

		session_token = data.token;

		const session = await AuthHandler.getAuthContext(data.token);

		expect(session).toBeDefined();
		if (!session) return;

		expect(session.user_id).toBe(testUser.id);
		expect(session.user_role).toBe("user");
		expect(session.type).toBe("session");
		expect(session.expires_at).toBeGreaterThan(Date.now());

		const tokenParts = AuthUtils.getTokenParts(data.token);
		expect(tokenParts).toBeDefined();
		if (!tokenParts) return;

		expect(await AuthUtils.verifyHashedTokenBase(tokenParts.base, session.hashed_token)).toBe(true);
		expect(tokenParts.prefix).toBe(`${AppConstants.APP_KEYS_PREFIX}_sess_`);
		expect(tokenParts.id).toBe(session.id);
	});

	test("POST /v1/auth/login with invalid credentials fails", async () => {
		await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: testUser.username, password: "WrongPassword" },
			},
			401,
		);
	});

	test("GET /v1/auth/session returns current session info", async () => {
		const data = await makeAPIRequest("/v1/auth/session", {
			authToken: session_token,
			expectedBodySchema: AuthModel.Session.Response,
		});

		expect(data.user_id).toBe(testUser.id);
		expect(data.user_role).toBe("user");
	});

	test("GET /v1/auth/session with invalid token fails", async () => {
		await makeAPIRequest(
			"/v1/auth/session",
			{
				authToken: "invalid_token",
			},
			401,
		);
	});

	test("GET /v1/auth/session with invalid authorization header fails", async () => {
		await makeAPIRequest(
			"/v1/auth/session",
			{
				additionalOptions: {
					headers: {
						Authorization: "Token invalid",
					},
				},
			},
			401,
		);
	});

	test("GET /v1/auth/session with empty bearer token fails", async () => {
		await makeAPIRequest(
			"/v1/auth/session",
			{
				additionalOptions: {
					headers: {
						Authorization: "Bearer ",
					},
				},
			},
			401,
		);
	});

	test("POST /v1/auth/login rate limits repeated failures", async () => {
		const rateLimitedUser = await seedUser("user", {}, "LimitP@ss1");

		for (let attempt = 0; attempt < 5; attempt++) {
			await makeAPIRequest(
				"/v1/auth/login",
				{
					method: "POST",
					body: {
						username: rateLimitedUser.username,
						password: "WrongPassword",
					},
				},
				401,
			);
		}

		await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: {
					username: rateLimitedUser.username,
					password: "WrongPassword",
				},
			},
			429,
		);
	});

	test("POST /v1/auth/login clears failed-attempt counter after successful login", async () => {
		const resetUser = await seedUser("user", {}, "ResetLimitP@ss1");

		for (let attempt = 0; attempt < 4; attempt++) {
			await makeAPIRequest(
				"/v1/auth/login",
				{
					method: "POST",
					body: {
						username: resetUser.username,
						password: "WrongPassword",
					},
				},
				401,
			);
		}

		const login = await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: {
					username: resetUser.username,
					password: resetUser.password,
				},
				expectedBodySchema: AuthModel.Login.Response,
			},
			200,
		);

		expect(login.token.startsWith(`${AppConstants.APP_KEYS_PREFIX}_sess_`)).toBe(true);

		for (let attempt = 0; attempt < 5; attempt++) {
			await makeAPIRequest(
				"/v1/auth/login",
				{
					method: "POST",
					body: {
						username: resetUser.username,
						password: "WrongPassword",
					},
				},
				401,
			);
		}

		await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: {
					username: resetUser.username,
					password: "WrongPassword",
				},
			},
			429,
		);
	});

	test("GET /v1/admin/users as non-admin fails", async () => {
		// with auth token
		await makeAPIRequest(
			"/v1/admin/users",
			{
				authToken: session_token,
			},
			403,
		);

		// without auth token
		await makeAPIRequest("/v1/admin/users", {}, 401);
	});

	test("POST /v1/auth/logout invalidates session", async () => {
		await makeAPIRequest("/v1/auth/logout", {
			method: "POST",
			authToken: session_token,
		});

		const session = await AuthHandler.getAuthContext(session_token);

		expect(session).toBeNil();
	});
});

describe("Auth reset-password routes", async () => {
	let resetUser: SeededUser;
	let resetSessionToken: string;

	beforeAll(async () => {
		resetUser = await seedUser("user");
		resetSessionToken = await seedSession(resetUser.id).then((s) => s.token);
	});

	test("POST /v1/auth/reset-password/request returns success for existing and unknown emails", async () => {
		await makeAPIRequest(
			"/v1/auth/reset-password/request",
			{
				method: "POST",
				body: { email: resetUser.email },
			},
			200,
		);

		await makeAPIRequest(
			"/v1/auth/reset-password/request",
			{
				method: "POST",
				body: { email: `nope-${randomUUID()}@example.com` },
			},
			200,
		);
	});

	test("POST /v1/auth/reset-password/request denies authenticated users", async () => {
		await makeAPIRequest(
			"/v1/auth/reset-password/request",
			{
				method: "POST",
				authToken: resetSessionToken,
				body: { email: resetUser.email },
			},
			401,
		);
	});

	test("POST /v1/auth/reset-password with invalid token fails", async () => {
		await makeAPIRequest(
			"/v1/auth/reset-password",
			{
				method: "POST",
				body: {
					reset_token: "invalid-token",
					new_password: "ResetP@ssw0rd1",
				},
			},
			400,
		);
	});

	test("POST /v1/auth/reset-password updates credentials for a valid reset token", async () => {
		const validResetToken = `reset_${randomUUID().replace(/-/g, "")}`;
		const nextPassword = "ResetP@ssw0rd1";
		const wrongLoginIP = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
		const correctLoginIP = `203.0.114.${Math.floor(Math.random() * 200) + 1}`;

		await DB.instance()
			.insert(DB.Tables.passwordResets)
			.values({
				token: hashResetToken(validResetToken),
				user_id: resetUser.id,
				expires_at: Date.now() + 10 * 60 * 1000,
			})
			.run();

		await makeAPIRequest(
			"/v1/auth/reset-password",
			{
				method: "POST",
				body: {
					reset_token: validResetToken,
					new_password: nextPassword,
				},
			},
			200,
		);

		await makeAPIRequest(
			"/v1/auth/session",
			{
				authToken: resetSessionToken,
			},
			401,
		);

		await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: {
					username: resetUser.username,
					password: resetUser.password,
				},
				additionalOptions: {
					headers: {
						"x-forwarded-for": wrongLoginIP,
					},
				},
			},
			401,
		);

		const login = await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: {
					username: resetUser.username,
					password: nextPassword,
				},
				additionalOptions: {
					headers: {
						"x-forwarded-for": correctLoginIP,
					},
				},
				expectedBodySchema: AuthModel.Login.Response,
			},
			200,
		);

		expect(login.token.startsWith(`${AppConstants.APP_KEYS_PREFIX}_sess_`)).toBe(true);
		resetUser.password = nextPassword;
	});
});

describe("Account routes", async () => {
	let session_token: string;

	beforeAll(async () => {
		session_token = await seedSession(testUser.id).then((s) => s.token);
	});

	test("GET /v1/account returns current user", async () => {
		const data = await makeAPIRequest("/v1/account", {
			authToken: session_token,
			expectedBodySchema: AccountModel.GetInfo.Response,
		});

		expect(data.id).toBe(testUser.id);
		expect(data.username).toBe(testUser.username);
		expect(data.display_name).toBe(testUser.display_name);
		expect(data.email).toBe(testUser.email);
		expect(data.role).toBe("user");
	});

	test("PUT /v1/account updates profile fields", async () => {
		const newUserData = {
			display_name: "Updated Name",
			username: "updatedusername",
			email: "updated@example.com",
			current_password: testUser.password,
		};

		await makeAPIRequest("/v1/account", {
			method: "PUT",
			authToken: session_token,
			body: newUserData,
		});

		testUser.display_name = newUserData.display_name;
		testUser.username = newUserData.username;
		testUser.email = newUserData.email;

		const dbresult = DB.instance()
			.select()
			.from(DB.Tables.users)
			.where(eq(DB.Tables.users.id, testUser.id))
			.get();

		expect(dbresult?.display_name).toBe(newUserData.display_name);
		expect(dbresult?.username).toBe(newUserData.username);
		expect(dbresult?.email).toBe(newUserData.email);
	});

	test("PUT /v1/account try updating role fails", async () => {
		await makeAPIRequest(
			"/v1/account",
			{
				method: "PUT",
				authToken: session_token,
				body: { role: "admin" },
			},
			400,
		);

		const dbresult = DB.instance()
			.select()
			.from(DB.Tables.users)
			.where(eq(DB.Tables.users.id, testUser.id))
			.get();
		expect(dbresult?.role).toBe("user");
	});

	test("PUT /v1/account/password rotates credentials and invalidates old sessions", async () => {
		const oldPassword = testUser.password;
		const newPassword = "NewP@ssw0rd1";

		await makeAPIRequest("/v1/account/password", {
			method: "PUT",
			authToken: session_token,
			body: {
				current_password: oldPassword,
				new_password: newPassword,
			},
		});

		testUser.password = newPassword;

		// Old session should be invalidated
		await makeAPIRequest(
			"/v1/account",
			{
				authToken: session_token,
			},
			401,
		);

		// Login with old password should fail
		await makeAPIRequest(
			"/v1/auth/login",
			{
				method: "POST",
				body: { username: testUser.username, password: oldPassword },
			},
			401,
		);

		// Login with new password should succeed
		const data = await makeAPIRequest("/v1/auth/login", {
			method: "POST",
			body: { username: testUser.username, password: newPassword },
			expectedBodySchema: AuthModel.Login.Response,
		});

		expect(data.token.startsWith(`${AppConstants.APP_KEYS_PREFIX}_sess_`)).toBe(true);

		session_token = data.token;
	});

	test("DELETE /v1/account fails because of existing data", async () => {
		// some data is created here to prevent deletion
		// await makeAPIRequest(
		// 	"/v1/account",
		// 	{
		// 		method: "DELETE",
		// 		authToken: session_token,
		// 	},
		// 	400,
		// );
	});

	test("DELETE /v1/account removes user data", async () => {
		await makeAPIRequest("/v1/account", {
			method: "DELETE",
			authToken: session_token,
		});

		const dbresult = DB.instance()
			.select()
			.from(DB.Tables.users)
			.where(eq(DB.Tables.users.id, testUser.id))
			.get();
		expect(dbresult).toBeUndefined();

		// recreate test user for further tests
		testUser = await seedUser("user", { username: "testuser" }, "UserP@ss1");
	});
});

describe("Account API key routes", async () => {
	let apiUser: SeededUser;
	let apiUserSessionToken: string;
	let createdApiKeyID: string;

	beforeAll(async () => {
		apiUser = await seedUser("user");
		apiUserSessionToken = await seedSession(apiUser.id).then((s) => s.token);
	});

	test("GET /account/apikeys starts empty", async () => {
		const list = await makeAPIRequest(
			"/v1/account/apikeys",
			{
				authToken: apiUserSessionToken,
			},
			200,
		);

		expect(list).toEqual([]);
	});

	test("POST /account/apikeys creates an API key", async () => {
		const created = await makeAPIRequest(
			"/v1/account/apikeys",
			{
				method: "POST",
				authToken: apiUserSessionToken,
				body: {
					description: "CI key",
					expires_at: "30d",
				},
			},
			200,
		);

		expect(created.id).toBeString();
		expect(created.token).toBeString();

		createdApiKeyID = created.id;
	});

	test("GET /account/apikeys/:apiKeyID returns key details", async () => {
		const key = await makeAPIRequest(
			`/v1/account/apikeys/${createdApiKeyID}`,
			{
				authToken: apiUserSessionToken,
			},
			200,
		);

		expect(key.id).toBe(createdApiKeyID);
		expect(key.description).toBe("CI key");
	});

	test("DELETE /account/apikeys/:apiKeyID removes key", async () => {
		await makeAPIRequest(
			`/v1/account/apikeys/${createdApiKeyID}`,
			{
				method: "DELETE",
				authToken: apiUserSessionToken,
			},
			200,
		);

		await makeAPIRequest(
			`/v1/account/apikeys/${createdApiKeyID}`,
			{
				authToken: apiUserSessionToken,
			},
			404,
		);
	});
});

describe("Account Preferences Routes", async () => {
	let preferencesUser: SeededUser;
	let sessionToken: string;

	beforeAll(async () => {
		preferencesUser = await seedUser("user", { username: "preferencesuser" }, "PrefsP@ss1");
		sessionToken = await seedSession(preferencesUser.id).then((s) => s.token);
	});

	test("GET /v1/account/preferences/search returns instance defaults without overrides", async () => {
		const data = await makeAPIRequest("/v1/account/preferences/search", {
			authToken: sessionToken,
			expectedBodySchema: AccountPreferencesModel.Search.Response,
		});

		expect(data.overrides).toEqual({});
		expect(data.effective).toEqual(data.defaults);

		// Nothing is persisted for computed defaults.
		const rows = DB.instance()
			.select()
			.from(DB.Tables.userPreferences)
			.where(eq(DB.Tables.userPreferences.user_id, preferencesUser.id))
			.all();
		expect(rows.length).toBe(0);
	});

	test("PUT /v1/account/preferences/search stores overrides and merges them", async () => {
		const data = await makeAPIRequest("/v1/account/preferences/search", {
			method: "PUT",
			authToken: sessionToken,
			body: { safesearch: 0, open_in_new_tab: true, disabled_engines: ["bing"] },
			expectedBodySchema: AccountPreferencesModel.Search.Response,
		});

		expect(data.overrides).toEqual({
			safesearch: 0,
			open_in_new_tab: true,
			disabled_engines: ["bing"],
		});
		expect(data.effective.safesearch).toBe(0);
		expect(data.effective.open_in_new_tab).toBe(true);
		expect(data.effective.language).toBe(data.defaults.language);
	});

	test("PUT /v1/account/preferences/search replaces (not merges) previous overrides", async () => {
		const data = await makeAPIRequest("/v1/account/preferences/search", {
			method: "PUT",
			authToken: sessionToken,
			body: { units: "imperial" },
			expectedBodySchema: AccountPreferencesModel.Search.Response,
		});
		expect(data.overrides).toEqual({ units: "imperial" });
		expect(data.effective.safesearch).toBe(data.defaults.safesearch);
	});

	test("Instance default changes flow through to users without an override", async () => {
		await SettingsHandler.updateSearchDefaults({ autocomplete: "brave" });
		const data = await makeAPIRequest("/v1/account/preferences/search", {
			authToken: sessionToken,
			expectedBodySchema: AccountPreferencesModel.Search.Response,
		});
		expect(data.effective.autocomplete).toBe("brave");
		expect(data.effective.units).toBe("imperial");
		await SettingsHandler.updateSearchDefaults({ autocomplete: "duckduckgo" });
	});

	test("PUT /v1/account/preferences/search rejects invalid values", async () => {
		await makeAPIRequest(
			"/v1/account/preferences/search",
			{ method: "PUT", authToken: sessionToken, body: { safesearch: 5 } },
			400,
		);
		await makeAPIRequest(
			"/v1/account/preferences/search",
			{ method: "PUT", authToken: sessionToken, body: { autocomplete: "altavista" } },
			400,
		);
	});

	test("GET /v1/account/preferences returns all stored preference keys", async () => {
		const data = await makeAPIRequest("/v1/account/preferences", {
			authToken: sessionToken,
			expectedBodySchema: AccountPreferencesModel.GetAll.Response,
		});
		expect(Object.keys(data).sort()).toEqual(
			Object.keys(AccountPreferencesModel.GetAll.Response.shape).sort(),
		);
		expect(data.search).toEqual({ units: "imperial" });
	});

	test("Preferences require a session", async () => {
		await makeAPIRequest("/v1/account/preferences/search", {}, 401);
		await makeAPIRequest("/v1/account/preferences/search", { method: "PUT", body: {} }, 401);
	});

	test("Preferences are isolated per user", async () => {
		const other = await seedUser("user", { username: "preferencesother" }, "OtherP@ss1");
		const otherSession = await seedSession(other.id).then((s) => s.token);
		const data = await makeAPIRequest("/v1/account/preferences/search", {
			authToken: otherSession,
			expectedBodySchema: AccountPreferencesModel.Search.Response,
		});
		expect(data.overrides).toEqual({});
	});

	test("DELETE /v1/account also removes stored preferences", async () => {
		const deletable = await seedUser("user", { username: "preferencesdeletable" }, "DeleteP@ss1");
		const deletableSession = await seedSession(deletable.id).then((s) => s.token);

		await makeAPIRequest("/v1/account/preferences/search", {
			method: "PUT",
			authToken: deletableSession,
			body: { safesearch: 2 },
		});
		await makeAPIRequest("/v1/account", { method: "DELETE", authToken: deletableSession });

		const rows = DB.instance()
			.select()
			.from(DB.Tables.userPreferences)
			.where(eq(DB.Tables.userPreferences.user_id, deletable.id))
			.all();
		expect(rows.length).toBe(0);
	});
});

describe("Docs Routes", async () => {
	test("GET /docs/v1/openapi returns API docs if enabled", async () => {
		await makeAPIRequest("/docs/v1/openapi", {}, 200);
	});

	test("GET /docs/v1 returns API docs UI if enabled", async () => {
		await makeAPIRequest("/docs/v1", {}, 200);
	});

	test("GET /docs/v1/openapi returns 404 if disabled", async () => {
		await API.stop();
		await API.init([], true);

		await makeAPIRequest("/docs/v1/openapi", {}, 404);
	});

	test("GET /docs/v1 returns 404 if disabled", async () => {
		await makeAPIRequest("/docs/v1", {}, 404);
	});
});
