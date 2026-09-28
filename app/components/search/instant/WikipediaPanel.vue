<script setup lang="ts">
import type { InstantAnswer } from "~/utils/types";

defineProps<{ answer: InstantAnswer; newTab: boolean }>();

const imageFailed = ref(false);
</script>

<template>
	<section class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40" :aria-label="answer.title">
		<img
			v-if="answer.data.thumbnail && !imageFailed"
			:src="answer.data.thumbnail"
			:alt="answer.title"
			class="max-h-64 w-full bg-slate-950 object-contain"
			loading="lazy"
			referrerpolicy="no-referrer"
			@error="imageFailed = true"
		/>
		<div class="space-y-3 p-5">
			<div>
				<h2 class="text-2xl font-semibold text-white">{{ answer.title }}</h2>
				<p v-if="answer.data.description" class="text-sm text-slate-400 first-letter:uppercase">
					{{ answer.data.description }}
				</p>
			</div>
			<p class="text-sm leading-relaxed text-slate-300">{{ answer.data.extract }}</p>
			<a
				:href="answer.data.url"
				:target="newTab ? '_blank' : undefined"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
			>
				<UIcon name="i-lucide-book-open" class="size-4" />
				Read more on Wikipedia
			</a>
		</div>
	</section>
</template>
