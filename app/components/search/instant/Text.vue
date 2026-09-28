<script setup lang="ts">
/**
 * Fallback renderer for text-like answers (random, UUID, hash, encoding, IP, lorem ipsum) and for
 * providers the frontend has no dedicated widget for.
 */
import type { InstantAnswer } from "~/utils/types";

const props = defineProps<{ answer: InstantAnswer }>();

const mono = computed(() => ["uuid", "hash", "encoding", "ip"].includes(props.answer.type));
const big = computed(
	() =>
		props.answer.type === "random" || (props.answer.type === "ip" && props.answer.data.kind === "ip"),
);
const paragraphs = computed<string[] | null>(() =>
	Array.isArray(props.answer.data.paragraphs) ? props.answer.data.paragraphs : null,
);
</script>

<template>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<div v-if="paragraphs" class="space-y-3 text-slate-300">
				<p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
			</div>
			<p
				v-else
				class="break-all whitespace-pre-wrap text-slate-100"
				:class="[mono ? 'font-mono' : '', big ? 'text-4xl font-semibold' : mono ? 'text-base' : 'text-lg']"
			>{{ answer.text }}</p>
			<p v-if="answer.data.input" class="mt-2 truncate text-xs text-slate-500">
				Input: <span class="font-mono">{{ answer.data.input }}</span>
			</p>
		</div>
		<UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy" @click="copyText(answer.text)" />
	</div>
</template>
