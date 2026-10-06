import type { SearchModels } from "../search/types";
import type { SettingsModels } from "../settings/models";

/**
 * AI answers from any OpenAI compatible `/chat/completions` endpoint (OpenAI, OpenRouter,
 * Ollama, LM Studio, vLLM, LiteLLM, Azure-compatible gateways, …).
 *
 * The model only sees the query and the top search results, numbered so it can cite them — plus,
 * in a chat, the earlier turns of the conversation. Requests go directly to the configured
 * endpoint (it is often a local LLM server).
 */
export class AIService {
	/** Earlier messages passed along with a follow-up; older ones are dropped. */
	static readonly HISTORY_MESSAGES = 12;
	private static readonly HISTORY_MESSAGE_CHARS = 4000;

	/**
	 * Appended to the system prompt on every chat turn. System prompts are usually strict about
	 * answering only from the search results; this note extends that to the conversation (earlier
	 * turns count as a source too) without lifting the admin's rules or licensing the model's own
	 * knowledge.
	 */
	private static readonly CHAT_NOTE = [
		"This is a follow-up in an ongoing conversation; earlier turns come first.",
		"Wherever the instructions above limit you to the search results, the earlier turns of this conversation count as a source as well: answer from them when the latest search results do not contain the answer, and do not say that no information was found when the conversation itself answers the question.",
		"The numbered search results belong to the latest message only; earlier turns' citations are not accessible.",
		"Some follow-ups need no web search and arrive without a search results block; answer those from the conversation.",
	].join(" ");

	/** Kept narrow on purpose: a skipped search that was needed costs more than a needless one. */
	private static readonly REWRITE_PROMPT = [
		"You decide whether answering the latest message of the conversation requires a web search. Reply with exactly one of:",
		"- NONE, only when the message reworks the previous answer or needs no facts at all: simplify, shorten, rephrase, reformat, summarize or translate it; a greeting, thank-you or acknowledgment.",
		"- Otherwise a short, standalone web search query. This includes every request for more details, new facts, comparisons, examples or current information. Resolve references like 'it' or 'the second one' using the conversation. Reply with the query only: no quotes, no explanation.",
		"When unsure, reply with a search query.",
	].join("\n");

	private static systemMessage(config: SettingsModels.AIConfig, now: Date, note?: string) {
		return {
			role: "system" as const,
			content: `${config.system_prompt}${note ? `\n${note}` : ""}\nToday's date: ${now.toISOString().slice(0, 10)}.`,
		};
	}

	/** `null` means no search was made (a conversational follow-up); `[]` means it found nothing. */
	private static questionMessage(query: string, results: readonly SearchModels.Result[] | null) {
		if (results === null) {
			return {
				role: "user" as const,
				content: `${query}\n\nNo new web search was made for this message; answer it from the conversation above.`,
			};
		}
		const context = results
			.map(
				(r, i) =>
					`[${i + 1}] ${r.title}\nURL: ${r.url}${r.content ? `\n${r.content.slice(0, 700)}` : ""}`,
			)
			.join("\n\n");
		return {
			role: "user" as const,
			content: `Query: ${query}\n\nSearch results:\n${context || "(no results)"}`,
		};
	}

	/** Citation numbers of earlier answers point at older result lists, so they are removed. */
	private static stripCitations(text: string) {
		return text.replace(/\s?\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g, "");
	}

	static buildMessages(
		query: string,
		results: readonly SearchModels.Result[],
		config: SettingsModels.AIConfig,
		now = new Date(),
	): AIService.Message[] {
		return [this.systemMessage(config, now), this.questionMessage(query, results)];
	}

	/**
	 * Messages for a chat turn: the recent history, then the new question with fresh results —
	 * or, with `results: null`, without a web search (answered from the conversation).
	 */
	static buildChatMessages(
		history: readonly AIService.ChatMessage[],
		question: string,
		results: readonly SearchModels.Result[] | null,
		config: SettingsModels.AIConfig,
		now = new Date(),
	): AIService.Message[] {
		// Without a conversation there is nothing to answer from but the results.
		if (!history.length) return this.buildMessages(question, results ?? [], config, now);
		const turns = history.slice(-this.HISTORY_MESSAGES).map((m) => ({
			role: m.role,
			content: (m.role === "assistant" ? this.stripCitations(m.content) : m.content).slice(
				0,
				this.HISTORY_MESSAGE_CHARS,
			),
		}));
		return [
			this.systemMessage(config, now, this.CHAT_NOTE),
			...turns,
			this.questionMessage(question, results),
		];
	}

	static sources(results: readonly SearchModels.Result[]): AIService.Source[] {
		return results.map((r, i) => ({ index: i + 1, title: r.title, url: r.url }));
	}

	private static headers(config: SettingsModels.AIConfig): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
			...config.extra_headers,
		};
	}

	private static endpoint(config: SettingsModels.AIConfig, path: string) {
		return `${config.base_url.replace(/\/+$/, "")}${path}`;
	}

	private static async request(
		config: SettingsModels.AIConfig,
		messages: readonly AIService.Message[],
		stream: boolean,
		signal?: AbortSignal,
	) {
		const signals = [AbortSignal.timeout(config.timeout_ms)];
		if (signal) signals.push(signal);
		const res = await fetch(this.endpoint(config, "/chat/completions"), {
			method: "POST",
			headers: this.headers(config),
			body: JSON.stringify({
				model: config.model,
				messages,
				temperature: config.temperature,
				max_tokens: config.max_tokens,
				stream,
			}),
			signal: AbortSignal.any(signals),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new AIService.AIError(
				`AI endpoint returned HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
			);
		}
		return res;
	}

	/** Stream the answer as text deltas. */
	static async *stream(
		messages: readonly AIService.Message[],
		config: SettingsModels.AIConfig,
		signal?: AbortSignal,
	): AsyncGenerator<string> {
		const res = await this.request(config, messages, true, signal);
		if (!res.body) throw new AIService.AIError("AI endpoint returned no body");

		// Servers that ignore `stream: true` answer with plain JSON.
		if (res.headers.get("content-type")?.includes("application/json")) {
			const data = (await res.json()) as any;
			const text = data.choices?.[0]?.message?.content;
			if (typeof text === "string") yield text;
			return;
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split(/\r?\n/);
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					const delta = this.parseStreamLine(line);
					if (delta === null) return;
					if (delta) yield delta;
				}
			}
			const delta = this.parseStreamLine(buffer);
			if (delta) yield delta;
		} finally {
			reader.releaseLock();
		}
	}

	/** One SSE line → text delta, `""` for no content, `null` for the end marker. */
	static parseStreamLine(line: string): string | null {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) return "";
		const payload = trimmed.slice(5).trim();
		if (payload === "[DONE]") return null;
		try {
			const data = JSON.parse(payload);
			if (data.error)
				throw new AIService.AIError(data.error.message ?? "AI endpoint reported an error");
			return data.choices?.[0]?.delta?.content ?? "";
		} catch (err) {
			if (err instanceof AIService.AIError) throw err;
			return "";
		}
	}

	/** Non-streaming answer. */
	static async answer(
		messages: readonly AIService.Message[],
		config: SettingsModels.AIConfig,
		signal?: AbortSignal,
	): Promise<string> {
		const res = await this.request(config, messages, false, signal);
		const data = (await res.json()) as any;
		const text = data.choices?.[0]?.message?.content;
		if (typeof text !== "string") throw new AIService.AIError("AI endpoint returned no answer");
		return text;
	}

	/**
	 * Whether a decision reply means "no web search": `NONE` alone or followed by punctuation and
	 * an explanation ("NONE, the conversation covers it"); an all-caps `NONE` always does. A query
	 * that merely starts with the word ("None Shall Pass") stays a query.
	 */
	private static isNoSearch(reply: string) {
		return /^NONE\b/.test(reply) || /^none\s*(?:$|[.,;:!?(–—-])/i.test(reply);
	}

	/**
	 * The web search for a chat message, or `null` when none is needed. Follow-ups ("and in
	 * winter?") only make sense with the conversation, so the model rewrites them into a standalone
	 * query; the same call also decides that purely conversational follow-ups ("simplify that",
	 * "thanks") need no web search at all (reply `NONE`). Falls back to the message itself when the
	 * endpoint fails or replies with something unusable — an unusable decision is no evidence that
	 * the message needs no search.
	 */
	static async searchQuery(
		history: readonly AIService.ChatMessage[],
		question: string,
		config: SettingsModels.AIConfig,
		signal?: AbortSignal,
	): Promise<string | null> {
		if (!history.length) return question;
		const transcript = history
			.slice(-6)
			.map(
				(m) =>
					`${m.role === "user" ? "User" : "Assistant"}: ${this.stripCitations(m.content).slice(0, 600)}`,
			)
			.join("\n");
		try {
			const res = await this.request(
				{
					...config,
					temperature: 0,
					// Reasoning models think before answering; 64 tokens often cut them off empty.
					max_tokens: 256,
					timeout_ms: Math.min(config.timeout_ms, 20_000),
				},
				[
					{ role: "system", content: this.REWRITE_PROMPT },
					{ role: "user", content: `Conversation:\n${transcript}\n\nLatest message: ${question}` },
				],
				false,
				signal,
			);
			const data = (await res.json()) as any;
			const choice = data.choices?.[0];
			const reply = choice?.message?.content;
			// A cut-off reply (a reasoning model out of tokens) may end mid-word: no usable decision.
			if (typeof reply !== "string" || choice.finish_reason === "length") return question;
			// Reasoning models may prefix their reply with a <think> block; small models like to
			// wrap it in a list marker, Markdown emphasis or quotes.
			const query = (
				reply
					.replace(/<think>[\s\S]*?<\/think>/g, "")
					.trim()
					.split("\n")[0] ?? ""
			)
				.replace(/^(?:[-*•>]|#+|\d+[.)])\s+/, "")
				.replace(/^[*`"'“”„]+|[*`"'“”]+$/g, "")
				.trim();
			if (this.isNoSearch(query)) return null;
			return query && query.length <= 300 && !query.includes("<think") ? query : question;
		} catch (err) {
			if (signal?.aborted) throw err;
			return question;
		}
	}

	/** Models offered by the endpoint (`GET /models`), for the admin UI. */
	static async listModels(config: SettingsModels.AIConfig): Promise<string[]> {
		const res = await fetch(this.endpoint(config, "/models"), {
			headers: this.headers(config),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new AIService.AIError(`AI endpoint returned HTTP ${res.status}`);
		const data = (await res.json()) as { data?: Array<{ id?: string }> };
		return (data.data ?? [])
			.map((m) => m.id)
			.filter((id): id is string => typeof id === "string")
			.sort();
	}

	/** Send a trivial prompt to verify URL, key and model. */
	static async test(
		config: SettingsModels.AIConfig,
	): Promise<{ ok: boolean; latency_ms: number; reply: string | null; error: string | null }> {
		const started = performance.now();
		try {
			const res = await this.request(
				{ ...config, max_tokens: 16 },
				[{ role: "user", content: "Reply with the single word: pong" }],
				false,
			);
			const data = (await res.json()) as any;
			return {
				ok: true,
				latency_ms: Math.round(performance.now() - started),
				reply: data.choices?.[0]?.message?.content ?? null,
				error: null,
			};
		} catch (err) {
			return {
				ok: false,
				latency_ms: Math.round(performance.now() - started),
				reply: null,
				error: (err as Error).message,
			};
		}
	}
}

export namespace AIService {
	export interface Source {
		index: number;
		title: string;
		url: string;
	}

	export interface Message {
		role: "system" | "user" | "assistant";
		content: string;
	}

	/** A stored chat message, as far as the model is concerned. */
	export interface ChatMessage {
		role: "user" | "assistant";
		content: string;
	}

	export class AIError extends Error {}
}
