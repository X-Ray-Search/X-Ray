/**
 * useAIChatsStore — the signed-in user's AI chat history (`GET /ai/chats`), most recently active
 * first. Resolves to `null` without a session. The chat page keeps it in sync after every turn
 * (`upsert`) and deletion (`remove`) instead of refetching. Cleared on login/logout.
 */
import { BasicAbstractStore } from "~/utils/abstractStore";
import type { AIChatSummary } from "~/utils/types";

class AIChatsStore extends BasicAbstractStore<AIChatSummary[]> {
	constructor() {
		super("aiChats", { enableAutoFetchIfEmpty: true });
	}

	protected override async fetchData() {
		if (!useAppCookies().sessionToken.get().value) return null;
		const response = await useAPI((api) => api.getAiChats({}), true);
		return response.success ? response.data : null;
	}

	/**
	 * Move a chat to the top of the history (after a new message) or add it. A history that was
	 * not loaded yet stays unloaded — it will contain the chat once it is fetched.
	 */
	upsert(chat: AIChatSummary) {
		const chats = this.useRaw();
		if (chats.value) chats.value = [chat, ...chats.value.filter((c) => c.id !== chat.id)];
	}

	/** Bump a chat without a server round trip (e.g. after a stopped answer). */
	touch(chatID: number, fallbackTitle: string) {
		const existing = this.useRaw().value?.find((c) => c.id === chatID);
		const now = Date.now();
		this.upsert({ id: chatID, title: fallbackTitle, created_at: now, ...existing, updated_at: now });
	}

	remove(chatID: number) {
		const chats = this.useRaw();
		if (chats.value) chats.value = chats.value.filter((c) => c.id !== chatID);
	}
}

export function useAIChatsStore() {
	return new AIChatsStore();
}
