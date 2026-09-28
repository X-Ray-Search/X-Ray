/**
 * useAIAnswer — streams an AI answer from `POST /api/v1/search/ai` (Server-Sent Events, read with
 * `postEventStream`). Events: `sources`, `delta` ({ text }), `done` ({ model }, only set for
 * admins) and `error`.
 */
import { postEventStream } from "./useEventStream";

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

	function handleEvent(event: string, payload: any) {
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
		const current = new AbortController();
		controller = current;

		try {
			await postEventStream(
				"/search/ai",
				{ q: query, language, stream: true },
				{ signal: current.signal, onEvent: handleEvent },
			);
			// Cast: TS narrows `status` from the assignments above and misses those in handleEvent.
			const state = status.value as AIAnswerStatus;
			if (state === "streaming" || state === "loading") status.value = "done";
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			error.value = (err as Error).message;
			status.value = "error";
		} finally {
			// A newer ask() may have replaced the controller already.
			if (controller === current) controller = null;
		}
	}

	onScopeDispose(stop);

	return { status, text, sources, model, error, ask, stop, reset };
}
