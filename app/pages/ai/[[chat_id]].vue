<script setup lang="ts">
/**
 * AI mode: a chat whose answers are grounded in live web searches, with the history on the side.
 * `/ai` starts a new chat (`/ai?q=…` sends `q` right away — the "AI mode" tab of the search
 * page), `/ai/:chat_id` shows one. Follow-ups asked under the AI answer of a search land here
 * too, as a chat seeded with that answer (see useAIChat).
 */
import { useAIChatsStore } from "~/composables/stores/useAIChatsStore";
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useSearchPreferencesStore } from "~/composables/stores/useSearchPreferencesStore";
import type { AIChatSummary } from "~/utils/types";

const route = useRoute();
const toast = useToast();

const chatID = (() => {
	const id = Number(route.params.chat_id);
	return Number.isInteger(id) && id > 0 ? id : null;
})();

const historyStore = useAIChatsStore();
const instance = await useInstanceStore().use();
const preferences = await useSearchPreferencesStore().use();
const history = await historyStore.use();

const { data: chatResponse } = await useAPIAsyncData(`ai-chat|${chatID ?? "new"}`, async () =>
	chatID ? await useAPI((api) => api.getAiChatsByChatId({ path: { chatID } }), true) : null,
);
const chat = computed(() => (chatResponse.value?.success ? chatResponse.value.data : null));
if (chatID && !chat.value) {
	throw createError({
		statusCode: chatResponse.value?.code ?? 404,
		statusMessage: chatResponse.value?.message ?? "Chat not found",
	});
}

const { messages, pending, model, busy, send, stop, retry } = useAIChat(
	chatID ?? 0,
	chat.value?.messages ?? [],
);

const prefs = computed(() => preferences.value?.effective);
const newTab = computed(() => prefs.value?.open_in_new_tab ?? false);
const aiEnabled = computed(
	() => !!instance.value?.features.ai && (prefs.value?.ai_mode ?? "off") !== "off",
);

const title = computed(() => {
	const stored = history.value?.find((c) => c.id === chatID)?.title ?? chat.value?.title;
	if (stored && stored !== "New chat") return stored;
	return pending.value?.question ?? (chatID ? "New chat" : "AI mode");
});

/** Where "Web results" leads: the latest search of the chat. */
const webQuery = computed(() => {
	const answered = messages.value.findLast((m) => m.search_query);
	return answered?.search_query ?? messages.value.find((m) => m.role === "user")?.content ?? null;
});

useSeoMeta({
	title: () => `${title.value} – ${instance.value?.name ?? "X-Ray"}`,
	robots: "noindex, nofollow",
});

// ------------------------------------------------------------------ sending

const draft = ref("");
const creating = ref(false);
const pendingQuestion = useTemplateRef<HTMLElement>("pendingQuestion");

/** New chats are created first and opened; the chat page then sends the message. */
async function startChat(content: string, replace = false) {
	creating.value = true;
	const response = await startAIChat(content, [], { replace });
	creating.value = false;
	if (!response.success) {
		draft.value = content;
		toast.add({
			title: "Could not start the chat",
			description: response.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
	}
}

async function submit(content: string) {
	if (!chatID) return startChat(content);
	draft.value = "";
	const sending = send(content);
	// Like Google's AI mode: the new question moves to the top, the answer unfolds below it.
	await nextTick();
	pendingQuestion.value?.scrollIntoView({ behavior: "smooth", block: "start" });
	await sending;
}

function onStop() {
	const question = stop();
	if (question) draft.value = question;
}

onMounted(() => {
	if (chatID) {
		const first = takePendingAIMessage(chatID);
		if (first) submit(first);
		else if (messages.value.length) window.scrollTo({ top: document.body.scrollHeight });
		return;
	}
	const q = typeof route.query.q === "string" ? route.query.q.trim() : "";
	if (q && aiEnabled.value) startChat(q, true);
});

// ------------------------------------------------------------------ history

const historyOpen = ref(false);
const deleting = ref<AIChatSummary | null>(null);
const deleteOpen = computed({
	get: () => deleting.value !== null,
	set: (open: boolean) => {
		if (!open) deleting.value = null;
	},
});
const deleteBusy = ref(false);

async function confirmDelete() {
	const target = deleting.value;
	if (!target) return;
	deleteBusy.value = true;
	const response = await useAPI((api) => api.deleteAiChatsByChatId({ path: { chatID: target.id } }));
	deleteBusy.value = false;
	if (!response.success) {
		toast.add({ title: "Could not delete the chat", description: response.message, color: "error" });
		return;
	}
	historyStore.remove(target.id);
	deleting.value = null;
	if (target.id === chatID) await navigateTo("/ai", { replace: true });
}
</script>

<template>
	<div class="flex flex-1">
		<aside class="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-slate-800/80 bg-slate-950/50 lg:block">
			<AiChatHistory :chats="history" :active-id="chatID" @delete="(c) => (deleting = c)" />
		</aside>

		<USlideover v-model:open="historyOpen" side="left" title="AI mode" :ui="{ content: 'max-w-72', body: 'p-0 sm:p-0' }">
			<template #body>
				<AiChatHistory
					:chats="history"
					:active-id="chatID"
					hide-brand
					@delete="(c) => (deleting = c)"
					@navigate="historyOpen = false"
				/>
			</template>
		</USlideover>

		<div class="flex min-w-0 flex-1 flex-col">
			<header
				class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-800/80 bg-[rgb(7_8_11/0.85)] px-3 backdrop-blur-xl sm:px-4"
			>
				<UButton
					icon="i-lucide-panel-left"
					color="neutral"
					variant="ghost"
					class="lg:hidden"
					aria-label="Chat history"
					@click="historyOpen = true"
				/>
				<NuxtLink to="/" class="shrink-0 lg:hidden" aria-label="X-Ray home">
					<ImgAppIcon class="size-8" />
				</NuxtLink>
				<h1 class="min-w-0 truncate text-sm font-medium text-slate-200">{{ title }}</h1>
				<UBadge v-if="model" :label="model" size="sm" variant="subtle" color="neutral" class="hidden font-mono sm:inline-flex" />

				<div class="ml-auto flex shrink-0 items-center gap-1">
					<UButton
						v-if="webQuery"
						:to="searchLocation({ q: webQuery })"
						icon="i-lucide-search"
						label="Web results"
						color="neutral"
						variant="ghost"
						class="max-sm:hidden"
					/>
					<UButton
						v-if="chatID"
						to="/ai"
						icon="i-lucide-square-pen"
						color="neutral"
						variant="ghost"
						class="lg:hidden"
						aria-label="New chat"
					/>
					<LayoutAccountMenu />
				</div>
			</header>

			<main class="flex-1 px-4 sm:px-6">
				<div class="mx-auto w-full max-w-3xl pt-8 pb-6">
					<!-- New chat -->
					<div v-if="!chatID" class="flex min-h-[55dvh] flex-col items-center justify-center text-center">
						<span class="flex size-12 items-center justify-center rounded-2xl bg-primary/15">
							<UIcon
								name="i-lucide-sparkles"
								class="size-6 text-primary"
								:class="creating ? 'animate-pulse' : ''"
							/>
						</span>
						<h2 class="mt-5 text-2xl font-semibold text-white sm:text-3xl">What do you want to know?</h2>
						<p class="mt-2 max-w-md text-slate-400">
							Answers come from a live web search, with sources — and you can keep asking follow-ups.
						</p>
					</div>

					<!-- Conversation -->
					<div v-else class="space-y-8">
						<template v-for="message in messages" :key="message.id">
							<div v-if="message.role === 'user'" class="flex justify-end">
								<p
									class="max-w-[85%] rounded-2xl rounded-br-md bg-slate-800/80 px-4 py-2.5 text-[15px] whitespace-pre-wrap text-slate-100"
								>
									{{ message.content }}
								</p>
							</div>
							<AiChatAnswer
								v-else
								:text="message.content"
								:sources="message.sources"
								:search-query="message.search_query"
								:new-tab="newTab"
							/>
						</template>

						<!-- The turn being answered; tall enough to scroll its question to the top. -->
						<div v-if="pending" class="min-h-[calc(100dvh-16rem)] space-y-8">
							<div ref="pendingQuestion" class="flex scroll-mt-20 justify-end">
								<p
									class="max-w-[85%] rounded-2xl rounded-br-md bg-slate-800/80 px-4 py-2.5 text-[15px] whitespace-pre-wrap text-slate-100"
								>
									{{ pending.question }}
								</p>
							</div>
							<AiChatAnswer
								:text="pending.text"
								:sources="pending.sources"
								:search-query="pending.searchQuery"
								:status="pending.status"
								:error="pending.error"
								:new-tab="newTab"
								@retry="retry"
							/>
						</div>
					</div>
				</div>
			</main>

			<div class="sticky bottom-0 z-20 bg-linear-to-t from-[rgb(7_8_11)] from-70% to-transparent px-4 pt-6 pb-4 sm:px-6">
				<div class="mx-auto max-w-3xl">
					<AiComposer
						v-model="draft"
						:placeholder="chatID ? 'Ask a follow-up…' : 'Ask anything…'"
						:busy="busy"
						:disabled="!aiEnabled || creating"
						:autofocus="!chatID"
						@submit="submit"
						@stop="onStop"
					/>
					<p class="mt-2 text-center text-[11px] text-slate-500">
						<template v-if="aiEnabled">AI answers can be wrong — check the sources.</template>
						<template v-else-if="!instance?.features.ai">AI answers are disabled on this instance.</template>
						<template v-else>
							AI answers are turned off in your
							<NuxtLink to="/dashboard/preferences" class="text-primary hover:underline">search preferences</NuxtLink>.
						</template>
					</p>
				</div>
			</div>
		</div>

		<UModal v-model:open="deleteOpen" title="Delete chat?" :description="deleting ? `“${deleting.title}” will be deleted permanently.` : undefined">
			<template #footer>
				<div class="flex w-full justify-end gap-2">
					<UButton label="Cancel" color="neutral" variant="ghost" @click="deleting = null" />
					<UButton label="Delete" icon="i-lucide-trash-2" color="error" :loading="deleteBusy" @click="confirmDelete" />
				</div>
			</template>
		</UModal>
	</div>
</template>
