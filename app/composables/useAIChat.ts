/**
 * useAIChat — one AI chat ("AI mode") on `/ai/:chat_id`: its messages and the turn being
 * streamed from `POST /api/v1/ai/chats/{id}/messages` (Server-Sent Events, read with
 * `postEventStream`). Events: `search` ({ query }), `sources`, `delta` ({ text }), `done`
 * (the stored answer and the updated chat) and `error`.
 *
 * `startAIChat` creates a chat (optionally seeded with a search's AI answer) and opens it; the
 * chat page picks the first message up with `takePendingAIMessage` and sends it. Handing it over
 * through `useState` (not the URL) means a reload never sends it twice.
 */
import type {
	AIChatMessage,
	AIChatSeedMessage,
	AIChatSource,
	AIChatTurnResult,
} from "~/utils/types";
import { useAIChatsStore } from "./stores/useAIChatsStore";
import { postEventStream } from "./useEventStream";

export interface AIChatPendingTurn {
	question: string;
	status: "searching" | "streaming" | "error";
	searchQuery: string | null;
	sources: AIChatSource[];
	text: string;
	error: string | null;
}

const PENDING_KEY = "aiChatPendingMessage";

export async function startAIChat(
	firstMessage: string | null,
	seed: AIChatSeedMessage[] = [],
	options: { replace?: boolean } = {},
) {
	const response = await useAPI((api) => api.postAiChats({ body: { messages: seed } }), true);
	if (!response.success) return response;
	if (firstMessage) {
		useState<{ chatID: number; content: string } | null>(PENDING_KEY).value = {
			chatID: response.data.id,
			content: firstMessage,
		};
	}
	// A seeded chat has messages already and belongs in the history right away.
	if (seed.length) useAIChatsStore().upsert(response.data);
	await navigateTo(`/ai/${response.data.id}`, { replace: options.replace });
	return response;
}

export function takePendingAIMessage(chatID: number): string | null {
	const pending = useState<{ chatID: number; content: string } | null>(PENDING_KEY, () => null);
	if (pending.value?.chatID !== chatID) return null;
	const { content } = pending.value;
	pending.value = null;
	return content;
}

export function useAIChat(chatID: number, initialMessages: AIChatMessage[]) {
	const history = useAIChatsStore();
	const messages = ref<AIChatMessage[]>([...initialMessages]);
	const pending = ref<AIChatPendingTurn | null>(null);
	/** The model of the latest answer — only admins get it. */
	const model = ref<string | null>(null);
	let controller: AbortController | null = null;

	const busy = computed(
		() => pending.value?.status === "searching" || pending.value?.status === "streaming",
	);

	// Negative ids never collide with stored messages; they only serve as list keys.
	let localID = 0;
	function localMessage(role: AIChatMessage["role"], content: string): AIChatMessage {
		return { id: --localID, role, content, sources: [], search_query: null, created_at: Date.now() };
	}

	function finish(result: AIChatTurnResult) {
		const question = pending.value?.question ?? "";
		messages.value.push(localMessage("user", question), result.message);
		model.value = result.model;
		pending.value = null;
		history.upsert(result.chat);
	}

	function handleEvent(event: string, payload: any) {
		const turn = pending.value;
		if (!turn) return;
		if (event === "search") turn.searchQuery = payload.query ?? null;
		else if (event === "sources") turn.sources = payload;
		else if (event === "delta") {
			turn.status = "streaming";
			turn.text += payload.text ?? "";
		} else if (event === "done") finish(payload as AIChatTurnResult);
		else if (event === "error") {
			turn.status = "error";
			turn.error = payload.message ?? "The AI endpoint failed";
		}
	}

	async function send(content: string) {
		const question = content.trim();
		if (!question || busy.value) return;
		pending.value = {
			question,
			status: "searching",
			searchQuery: null,
			sources: [],
			text: "",
			error: null,
		};
		const current = new AbortController();
		controller = current;

		try {
			await postEventStream(
				`/ai/chats/${chatID}/messages`,
				{ content: question, stream: true },
				{ signal: current.signal, onEvent: handleEvent },
			);
			if (pending.value?.question === question && busy.value) {
				pending.value.status = "error";
				pending.value.error = "The answer was cut off.";
			}
		} catch (err) {
			if ((err as Error).name === "AbortError" || !pending.value) return;
			pending.value.status = "error";
			pending.value.error = (err as Error).message;
		} finally {
			if (controller === current) controller = null;
		}
	}

	/**
	 * Stop the answer. The server keeps what was generated so far, and so does the page; without
	 * any text the turn is dropped and its question returned (to put it back into the input).
	 */
	function stop(): string | null {
		controller?.abort();
		controller = null;
		const turn = pending.value;
		if (!turn || turn.status === "error") return null;
		pending.value = null;
		if (!turn.text) return turn.question;
		messages.value.push(localMessage("user", turn.question), {
			...localMessage("assistant", turn.text),
			sources: turn.sources,
			search_query: turn.searchQuery,
		});
		history.touch(chatID, turn.question.replace(/\s+/g, " ").slice(0, 80));
		return null;
	}

	/** Send the failed question again. */
	function retry() {
		const question = pending.value?.question;
		pending.value = null;
		if (question) send(question);
	}

	onScopeDispose(() => controller?.abort());

	return { messages, pending, model, busy, send, stop, retry };
}
