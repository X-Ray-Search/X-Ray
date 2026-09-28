/**
 * useAIAnswer — streams an AI answer from `POST /api/v1/search/ai` (Server-Sent Events).
 *
 * Exception to "all API calls go through useAPI": the generated SDK cannot consume this SSE
 * stream, so this composable uses `fetch` directly — with the same base URL and session token as
 * `updateAPIClient`. Events: `sources`, `delta` ({ text }), `done` ({ model }) and `error`.
 */
import { API_BASE_URL } from "./updateAPIClient";

export interface AISource {
	index: number;
	title: string;
	url: string;
}

export type AIAnswerStatus = "idle" | "loading" | "streaming" | "done" | "error";

export function useAIAnswer() {
	const status = ref<AIAnswerStatus>("idle");
	const text = ref("");
	const sources = ref<AISource[]>([]);
	const model = ref<string | null>(null);
	const error = ref<string | null>(null);
	let controller: AbortController | null = null;

	function stop() {
		controller?.abort();
		controller = null;
		if (status.value === "loading" || status.value === "streaming") {
			status.value = text.value ? "done" : "idle";
		}
	}

	function reset() {
		stop();
		status.value = "idle";
		text.value = "";
		sources.value = [];
		model.value = null;
		error.value = null;
	}

	function handleEvent(event: string, data: string) {
		let payload: any;
		try {
			payload = JSON.parse(data);
		} catch {
			return;
		}
		if (event === "sources") sources.value = payload;
		else if (event === "delta") {
			status.value = "streaming";
			text.value += payload.text ?? "";
		} else if (event === "done") {
			model.value = payload.model ?? null;
			status.value = "done";
		} else if (event === "error") {
			error.value = payload.message ?? "The AI endpoint failed";
			status.value = "error";
		}
	}

	async function ask(query: string, language?: string) {
		reset();
		status.value = "loading";
		controller = new AbortController();
		const token = useAppCookies().sessionToken.get().value;

		try {
			const res = await fetch(`${API_BASE_URL}/search/ai`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ q: query, language, stream: true }),
				signal: controller.signal,
			});

			if (!res.ok || !res.body) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? `Request failed (HTTP ${res.status})`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				// SSE messages are separated by a blank line.
				let boundary = buffer.indexOf("\n\n");
				while (boundary !== -1) {
					const message = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					let event = "message";
					const data: string[] = [];
					for (const line of message.split("\n")) {
						if (line.startsWith("event:")) event = line.slice(6).trim();
						else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
					}
					handleEvent(event, data.join("\n"));
					boundary = buffer.indexOf("\n\n");
				}
			}
			// Cast: TS narrows `status` from the assignments above and misses those in handleEvent.
			const current = status.value as AIAnswerStatus;
			if (current === "streaming" || current === "loading") status.value = "done";
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			error.value = (err as Error).message;
			status.value = "error";
		} finally {
			controller = null;
		}
	}

	onScopeDispose(stop);

	return { status, text, sources, model, error, ask, stop, reset };
}
