import type { SearchModels } from "../search/types";
import type { SettingsModels } from "../settings/models";

/**
 * AI answers from any OpenAI compatible `/chat/completions` endpoint (OpenAI, OpenRouter,
 * Ollama, LM Studio, vLLM, LiteLLM, Azure-compatible gateways, …).
 *
 * The model only sees the query and the top search results, numbered so it can cite them.
 * Requests go directly to the configured endpoint (it is often a local LLM server).
 */
export class AIService {
	static buildMessages(
		query: string,
		results: readonly SearchModels.Result[],
		config: SettingsModels.AIConfig,
		now = new Date(),
	) {
		const context = results
			.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}${r.content ? `\n${r.content.slice(0, 700)}` : ""}`)
			.join("\n\n");
		return [
			{ role: "system" as const, content: `${config.system_prompt}\nToday's date: ${now.toISOString().slice(0, 10)}.` },
			{ role: "user" as const, content: `Query: ${query}\n\nSearch results:\n${context || "(no results)"}` },
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
		messages: ReturnType<typeof AIService.buildMessages>,
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
			throw new AIService.AIError(`AI endpoint returned HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
		}
		return res;
	}

	/** Stream the answer as text deltas. */
	static async *stream(
		query: string,
		results: readonly SearchModels.Result[],
		config: SettingsModels.AIConfig,
		signal?: AbortSignal,
	): AsyncGenerator<string> {
		const res = await this.request(config, this.buildMessages(query, results, config), true, signal);
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
			if (data.error) throw new AIService.AIError(data.error.message ?? "AI endpoint reported an error");
			return data.choices?.[0]?.delta?.content ?? "";
		} catch (err) {
			if (err instanceof AIService.AIError) throw err;
			return "";
		}
	}

	/** Non-streaming answer. */
	static async answer(
		query: string,
		results: readonly SearchModels.Result[],
		config: SettingsModels.AIConfig,
		signal?: AbortSignal,
	): Promise<string> {
		const res = await this.request(config, this.buildMessages(query, results, config), false, signal);
		const data = (await res.json()) as any;
		const text = data.choices?.[0]?.message?.content;
		if (typeof text !== "string") throw new AIService.AIError("AI endpoint returned no answer");
		return text;
	}

	/** Models offered by the endpoint (`GET /models`), for the admin UI. */
	static async listModels(config: SettingsModels.AIConfig): Promise<string[]> {
		const res = await fetch(this.endpoint(config, "/models"), {
			headers: this.headers(config),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new AIService.AIError(`AI endpoint returned HTTP ${res.status}`);
		const data = (await res.json()) as { data?: Array<{ id?: string }> };
		return (data.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string").sort();
	}

	/** Send a trivial prompt to verify URL, key and model. */
	static async test(config: SettingsModels.AIConfig): Promise<{ ok: boolean; latency_ms: number; reply: string | null; error: string | null }> {
		const started = performance.now();
		try {
			const res = await this.request(
				{ ...config, max_tokens: 16 },
				[{ role: "user", content: "Reply with the single word: pong" }] as any,
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
			return { ok: false, latency_ms: Math.round(performance.now() - started), reply: null, error: (err as Error).message };
		}
	}
}

export namespace AIService {
	export interface Source {
		index: number;
		title: string;
		url: string;
	}

	export class AIError extends Error {}
}
