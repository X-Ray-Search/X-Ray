import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AIChats } from "../server/lib/ai/chats";
import { API } from "../server/lib/api";
import { AIChatModel } from "../server/lib/api/versions/v1/routes/ai/model";
import { SettingsHandler } from "../server/lib/settings";
import { SettingsModels } from "../server/lib/settings/models";
import { makeAPIRequest } from "./helpers/api";
import { createFakeEngine, FakeEngine, resetEngines } from "./helpers/fakeEngine";
import { seedSession, seedUser } from "./helpers/seed";

let token: string;
let userID: number;
let otherToken: string;
let adminToken: string;

let fakeLLM: ReturnType<typeof Bun.serve>;
/** Answer requests (rewrites are counted separately). */
const answerRequests: any[] = [];
let rewriteRequests = 0;

const SEED = [
	{ role: "user", content: "rust borrow checker" },
	{
		role: "assistant",
		content: "It checks that references are valid [1].",
		sources: [{ index: 1, title: "A", url: "https://a.example/" }],
	},
];

type SSEEvent = { event: string; data: any };

async function sendStreaming(chatID: number, content: string, authToken = token) {
	const res = await API.getApp().request(`/v1/ai/chats/${chatID}/messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	expect(res.headers.get("content-type")).toContain("text/event-stream");
	const body = await res.text();
	return [...body.matchAll(/event: (\w+)\ndata: (.+)\n/g)].map(
		(m) => ({ event: m[1]!, data: JSON.parse(m[2]!) }) satisfies SSEEvent,
	);
}

async function createChat(body: Record<string, any> = {}, authToken = token) {
	return makeAPIRequest<AIChatModel.Summary>(
		"/v1/ai/chats",
		{ method: "POST", authToken, body, expectedBodySchema: AIChatModel.Summary },
		201,
	);
}

beforeAll(async () => {
	const user = await seedUser("user");
	userID = user.id;
	token = (await seedSession(user.id)).token;
	otherToken = (await seedSession((await seedUser("user")).id)).token;
	adminToken = (await seedSession((await seedUser("admin")).id)).token;

	fakeLLM = Bun.serve({
		port: 0,
		async fetch(req) {
			const body = (await req.json()) as any;
			if (
				String(body.messages[0]?.content).startsWith("You decide whether answering the latest message")
			) {
				rewriteRequests++;
				// "can you simplify that?" needs no web search; every other follow-up is rewritten.
				const latest = String(body.messages[1]?.content ?? "")
					.split("Latest message: ")
					.pop();
				return Response.json({
					choices: [
						{
							message: {
								content: latest === "can you simplify that?" ? "NONE" : '"rust borrow checker lifetimes"',
							},
						},
					],
				});
			}
			answerRequests.push(body);
			if (!body.stream) {
				return Response.json({ choices: [{ message: { content: "Lifetimes [1]." } }] });
			}
			const chunks = ["Lifetimes ", "[1]."].map(
				(text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
			);
			return new Response(`${chunks.join("")}data: [DONE]\n\n`, {
				headers: { "Content-Type": "text/event-stream" },
			});
		},
	});

	await resetEngines();
	await createFakeEngine("alpha", {
		results: [
			{ url: "https://lifetimes.example/", title: "Lifetimes", content: "about lifetimes" },
			{ url: "https://b.example/", title: "B" },
		],
	});
	await SettingsHandler.updateAIConfig({
		enabled: true,
		base_url: `http://127.0.0.1:${fakeLLM.port}/v1`,
		model: "test-model",
	});
});

afterAll(async () => {
	fakeLLM.stop(true);
	await resetEngines();
	await SettingsHandler.updateAIConfig(SettingsModels.AI_DEFAULTS);
	await SettingsHandler.updateInstance(SettingsModels.INSTANCE_DEFAULTS);
});

describe("AI chats", () => {
	test("require sign-in, also on public instances", async () => {
		await SettingsHandler.updateInstance({ search_access: "public" });
		await makeAPIRequest("/v1/ai/chats", {}, 401);
		await makeAPIRequest("/v1/ai/chats", { method: "POST", body: {} }, 401);
		await SettingsHandler.updateInstance({ search_access: "authenticated" });
	});

	test("continue a search answer with a follow-up (SSE)", async () => {
		const chat = await createChat({ messages: SEED });
		expect(chat.title).toBe("rust borrow checker");

		const events = await sendStreaming(chat.id, "what about lifetimes?");
		expect(events.map((e) => e.event)).toEqual(["search", "sources", "delta", "delta", "done"]);

		// The follow-up was rewritten into a standalone query before searching.
		expect(events[0]!.data.query).toBe("rust borrow checker lifetimes");
		expect(events[1]!.data[0].url).toBe("https://lifetimes.example/");
		const done = events.at(-1)!.data as AIChatModel.Send.Response;
		expect(done.message.content).toBe("Lifetimes [1].");
		expect(done.message.search_query).toBe("rust borrow checker lifetimes");
		expect(done.model).toBeNull();
		expect(done.chat.updated_at).toBeGreaterThanOrEqual(chat.updated_at);

		// History first (old citations stripped), then the question with the fresh results.
		const request = answerRequests.at(-1);
		expect(request.messages[0].content).toContain("follow-up");
		expect(request.messages[1]).toEqual({ role: "user", content: "rust borrow checker" });
		expect(request.messages[2]).toEqual({
			role: "assistant",
			content: "It checks that references are valid.",
		});
		expect(request.messages[3].content).toStartWith("Query: what about lifetimes?");
		expect(request.messages[3].content).toContain("[1] Lifetimes");

		const stored = await makeAPIRequest<AIChatModel.Chat>(`/v1/ai/chats/${chat.id}`, {
			authToken: token,
			expectedBodySchema: AIChatModel.Chat,
		});
		expect(stored.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
		expect(stored.messages[1]!.sources[0]!.url).toBe("https://a.example/");
		expect(stored.messages[1]!.search_query).toBe("rust borrow checker");
		expect(stored.messages[3]!.sources[0]!.url).toBe("https://lifetimes.example/");

		const list = await makeAPIRequest<AIChatModel.Summary[]>("/v1/ai/chats", { authToken: token });
		expect(list[0]!.id).toBe(chat.id);
	});

	test("answer conversational follow-ups from the conversation, without a web search (SSE)", async () => {
		const chat = await createChat({ messages: SEED });
		const engineCalls = FakeEngine.callsOf("alpha");

		const events = await sendStreaming(chat.id, "can you simplify that?");
		expect(events.map((e) => e.event)).toEqual(["search", "delta", "delta", "done"]);
		expect(events[0]!.data).toEqual({ query: null });
		// No web search was made, so no engine was hit and no sources were announced.
		expect(FakeEngine.callsOf("alpha")).toBe(engineCalls);

		const done = events.at(-1)!.data as AIChatModel.Send.Response;
		expect(done.message.search_query).toBeNull();
		expect(done.message.sources).toEqual([]);

		// The system note licenses the conversation as context; the question arrives without a
		// search results block.
		const request = answerRequests.at(-1);
		expect(request.messages[0].content).toContain("follow-up in an ongoing conversation");
		expect(request.messages.at(-1).content).toStartWith("can you simplify that?");
		expect(request.messages.at(-1).content).toContain("No new web search");
		expect(request.messages.at(-1).content).not.toContain("Search results:");

		const stored = await makeAPIRequest<AIChatModel.Chat>(`/v1/ai/chats/${chat.id}`, {
			authToken: token,
			expectedBodySchema: AIChatModel.Chat,
		});
		expect(stored.messages[3]!.search_query).toBeNull();
		expect(stored.messages[3]!.sources).toEqual([]);
	});

	test("answer conversational follow-ups without a web search (JSON path)", async () => {
		const chat = await createChat({ messages: SEED });
		const res = await makeAPIRequest<AIChatModel.Send.Response>(`/v1/ai/chats/${chat.id}/messages`, {
			method: "POST",
			authToken: token,
			body: { content: "can you simplify that?", stream: false },
			expectedBodySchema: AIChatModel.Send.Response,
		});
		expect(res.message.search_query).toBeNull();
		expect(res.message.sources).toEqual([]);
	});

	test("new chats skip the rewrite, get their title from the first question; admins see the model", async () => {
		const chat = await createChat({}, adminToken);
		expect(chat.title).toBe("New chat");
		const rewritesBefore = rewriteRequests;

		const res = await makeAPIRequest<AIChatModel.Send.Response>(`/v1/ai/chats/${chat.id}/messages`, {
			method: "POST",
			authToken: adminToken,
			body: { content: "What is a lifetime in Rust?", stream: false },
			expectedBodySchema: AIChatModel.Send.Response,
		});
		expect(rewriteRequests).toBe(rewritesBefore);
		expect(res.message.search_query).toBe("What is a lifetime in Rust?");
		expect(res.model).toBe("test-model");
		expect(res.chat.title).toBe("What is a lifetime in Rust?");
	});

	test("chats without messages are not listed", async () => {
		const chat = await createChat();
		const list = await makeAPIRequest<AIChatModel.Summary[]>("/v1/ai/chats", { authToken: token });
		expect(list.some((c) => c.id === chat.id)).toBe(false);
	});

	test("chats are private", async () => {
		const chat = await createChat({ messages: SEED });
		await makeAPIRequest(`/v1/ai/chats/${chat.id}`, { authToken: otherToken }, 404);
		await makeAPIRequest(
			`/v1/ai/chats/${chat.id}/messages`,
			{ method: "POST", authToken: otherToken, body: { content: "hi" } },
			404,
		);
		await makeAPIRequest(`/v1/ai/chats/${chat.id}`, { method: "DELETE", authToken: otherToken }, 404);

		await makeAPIRequest(`/v1/ai/chats/${chat.id}`, { method: "DELETE", authToken: token });
		await makeAPIRequest(`/v1/ai/chats/${chat.id}`, { authToken: token }, 404);
	});

	test("rejects seeds that are not complete turns or cite non-http sources", async () => {
		await makeAPIRequest(
			"/v1/ai/chats",
			{ method: "POST", authToken: token, body: { messages: SEED.slice(0, 1) } },
			400,
		);
		const bad = [
			SEED[0],
			{ ...SEED[1], sources: [{ index: 1, title: "x", url: "javascript:alert(1)" }] },
		];
		await makeAPIRequest(
			"/v1/ai/chats",
			{ method: "POST", authToken: token, body: { messages: bad } },
			400,
		);
	});

	test("respect ai_mode, but the history stays readable", async () => {
		const chat = await createChat({ messages: SEED });
		await SettingsHandler.setUserOverrides(userID, { ai_mode: "off" });
		await makeAPIRequest("/v1/ai/chats", { method: "POST", authToken: token, body: {} }, 403);
		await makeAPIRequest(
			`/v1/ai/chats/${chat.id}/messages`,
			{ method: "POST", authToken: token, body: { content: "hi" } },
			403,
		);
		await makeAPIRequest(`/v1/ai/chats/${chat.id}`, { authToken: token });
		await SettingsHandler.setUserOverrides(userID, {});
	});

	test("are deleted with the account", async () => {
		await createChat({ messages: SEED });
		await AIChats.deleteAllForUser(userID);
		expect(await AIChats.list(userID)).toEqual([]);
	});
});
