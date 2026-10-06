import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AIService } from "../server/lib/ai";
import type { SearchModels } from "../server/lib/search/types";
import { SettingsModels } from "../server/lib/settings/models";

/**
 * Unit tests of the AI prompt construction and the follow-up search decision — against a fake
 * OpenAI compatible endpoint, with no database, settings or engines involved.
 */

let reply = "NONE";
let failing = false;
let endpoint: ReturnType<typeof Bun.serve>;
const requests: any[] = [];

/** The strict prompt stored by existing installs — the chat note must still win over it. */
const STRICT_PROMPT = [
	"You are the answer assistant of a privacy-respecting search engine.",
	"Answer the user's query concisely using ONLY the numbered search results provided.",
	"Cite sources inline with their number in square brackets, e.g. [1] or [2][4].",
	"If the results do not contain the answer, say so briefly instead of guessing.",
	"Use short paragraphs or bullet lists and plain Markdown. Answer in the language of the query.",
].join(" ");

const CONFIG: SettingsModels.AIConfig = {
	...SettingsModels.AI_DEFAULTS,
	enabled: true,
	base_url: "",
	model: "test-model",
	timeout_ms: 2000,
	system_prompt: STRICT_PROMPT,
};

const HISTORY: AIService.ChatMessage[] = [
	{ role: "user", content: "rust borrow checker" },
	{ role: "assistant", content: "It checks that references are valid [1]." },
];

/** The aggregated result type has many required fields; fill them. */
function result(partial: Partial<SearchModels.Result> = {}): SearchModels.Result {
	return {
		url: "https://lifetimes.example/",
		title: "Lifetimes",
		content: "about lifetimes",
		template: "web",
		category: "general",
		engines: ["alpha"],
		positions: [1],
		score: 1,
		published_at: null,
		thumbnail: null,
		img_src: null,
		width: null,
		height: null,
		source: null,
		author: null,
		duration: null,
		embed_url: null,
		views: null,
		...partial,
	};
}

beforeAll(() => {
	endpoint = Bun.serve({
		port: 0,
		async fetch(req) {
			requests.push(await req.json());
			if (failing) return new Response("boom", { status: 500 });
			return Response.json({ choices: [{ message: { content: reply } }] });
		},
	});
	CONFIG.base_url = `http://127.0.0.1:${endpoint.port}/v1`;
});

afterAll(() => endpoint.stop(true));

describe("AIService.searchQuery", () => {
	test("searches the first message as-is, without asking the model", async () => {
		const requestsBefore = requests.length;
		expect(await AIService.searchQuery([], "What is a lifetime?", CONFIG)).toBe(
			"What is a lifetime?",
		);
		expect(requests.length).toBe(requestsBefore);
	});

	test("a NONE decision means the conversation alone answers the message", async () => {
		for (reply of ["NONE", "none", " None. ", '"NONE"', "NONE!"]) {
			expect(await AIService.searchQuery(HISTORY, "can you simplify that?", CONFIG)).toBeNull();
		}
	});

	test("rewrites a follow-up into a standalone query", async () => {
		reply = '"rust borrow checker lifetimes"';
		expect(await AIService.searchQuery(HISTORY, "what about lifetimes?", CONFIG)).toBe(
			"rust borrow checker lifetimes",
		);
	});

	test("decides with temperature 0 and enough tokens for reasoning models", async () => {
		reply = "NONE";
		await AIService.searchQuery(HISTORY, "why?", CONFIG);
		const request = requests.at(-1);
		expect(request.temperature).toBe(0);
		expect(request.max_tokens).toBeGreaterThanOrEqual(128);
	});

	test("falls back to the message when the reply is unusable", async () => {
		const unterminatedThink = `<think>still deciding`;
		for (reply of ["", "  ", "a".repeat(301), unterminatedThink]) {
			expect(await AIService.searchQuery(HISTORY, "what about lifetimes?", CONFIG)).toBe(
				"what about lifetimes?",
			);
		}
	});

	test("falls back to the message when the endpoint fails", async () => {
		failing = true;
		expect(await AIService.searchQuery(HISTORY, "what about lifetimes?", CONFIG)).toBe(
			"what about lifetimes?",
		);
		failing = false;
	});
});

describe("AIService.buildChatMessages", () => {
	const RESULTS = [result()];

	test("follow-ups with results: the note overrides strict prompts and adds the history", () => {
		const messages = AIService.buildChatMessages(HISTORY, "what about lifetimes?", RESULTS, CONFIG);
		expect(messages[0]).toMatchObject({ role: "system" });
		expect(messages[0]!.content).toContain(STRICT_PROMPT);
		expect(messages[0]!.content).toContain("override anything said above");
		expect(messages[1]).toEqual({ role: "user", content: "rust borrow checker" });
		// Citations of earlier answers pointed at an older result list, so they are stripped.
		expect(messages[2]).toEqual({
			role: "assistant",
			content: "It checks that references are valid.",
		});
		expect(messages[3]!.content).toStartWith("Query: what about lifetimes?");
		expect(messages[3]!.content).toContain("[1] Lifetimes");
	});

	test("follow-ups without a search: the question arrives bare, answered from the conversation", () => {
		const messages = AIService.buildChatMessages(HISTORY, "can you simplify that?", null, CONFIG);
		expect(messages[0]!.content).toContain("Some follow-ups need no web search");
		expect(messages.at(-1)?.content).toStartWith("can you simplify that?");
		expect(messages.at(-1)?.content).toContain("No new web search");
		expect(messages.at(-1)?.content).not.toContain("Search results:");
	});

	test("empty history: no note, always a results block", () => {
		const messages = AIService.buildChatMessages([], "What is a lifetime?", RESULTS, CONFIG);
		expect(messages).toHaveLength(2);
		expect(messages[0]!.content).not.toContain("override anything said above");
		expect(messages[1]!.content).toContain("Search results:");
	});
});
