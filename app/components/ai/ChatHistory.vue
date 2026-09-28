<script setup lang="ts">
/** The AI chat history: "New chat", then the chats grouped by their last activity. */
import type { AIChatSummary } from "~/utils/types";

const props = defineProps<{
	chats: AIChatSummary[] | null;
	activeId: number | null;
	/** Hide the logo row (inside the mobile slideover, which has its own header). */
	hideBrand?: boolean;
}>();
const emit = defineEmits<{ delete: [chat: AIChatSummary]; navigate: [] }>();

const DAY = 24 * 60 * 60 * 1000;

const groups = computed(() => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const start = today.getTime();
	const buckets = [
		{ label: "Today", from: start },
		{ label: "Yesterday", from: start - DAY },
		{ label: "Previous 7 days", from: start - 7 * DAY },
		{ label: "Previous 30 days", from: start - 30 * DAY },
		{ label: "Older", from: Number.NEGATIVE_INFINITY },
	].map((bucket) => ({ ...bucket, chats: [] as AIChatSummary[] }));

	for (const chat of props.chats ?? []) {
		buckets.find((bucket) => chat.updated_at >= bucket.from)?.chats.push(chat);
	}
	return buckets.filter((bucket) => bucket.chats.length);
});
</script>

<template>
	<div class="flex h-full flex-col">
		<div v-if="!hideBrand" class="flex h-14 shrink-0 items-center gap-2.5 px-4">
			<NuxtLink to="/" class="shrink-0" aria-label="X-Ray home">
				<ImgAppIcon class="size-8" />
			</NuxtLink>
			<span class="font-medium text-white">AI mode</span>
		</div>

		<div class="px-3 pb-2" :class="hideBrand ? 'pt-3' : ''">
			<UButton
				to="/ai"
				icon="i-lucide-square-pen"
				label="New chat"
				color="neutral"
				variant="soft"
				block
				class="justify-start"
				@click="emit('navigate')"
			/>
		</div>

		<nav class="flex-1 overflow-y-auto px-2 pb-4" aria-label="Chat history">
			<div v-if="chats === null" class="space-y-2 px-2 pt-4">
				<USkeleton v-for="n in 5" :key="n" class="h-7 w-full" />
			</div>
			<p v-else-if="!chats.length" class="px-3 pt-4 text-sm text-slate-500">
				Your chats show up here.
			</p>

			<div v-for="group in groups" :key="group.label" class="pt-4">
				<h3 class="px-3 pb-1 text-xs font-medium text-slate-500">{{ group.label }}</h3>
				<div v-for="chat in group.chats" :key="chat.id" class="group relative">
					<NuxtLink
						:to="`/ai/${chat.id}`"
						class="block truncate rounded-lg py-2 pr-9 pl-3 text-sm transition"
						:class="
							chat.id === activeId
								? 'bg-primary/10 text-white'
								: 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
						"
						:title="chat.title"
						:aria-current="chat.id === activeId ? 'page' : undefined"
						@click="emit('navigate')"
					>
						{{ chat.title }}
					</NuxtLink>
					<UButton
						icon="i-lucide-trash-2"
						size="xs"
						color="neutral"
						variant="ghost"
						class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
						:aria-label="`Delete “${chat.title}”`"
						@click="emit('delete', chat)"
					/>
				</div>
			</div>
		</nav>
	</div>
</template>
