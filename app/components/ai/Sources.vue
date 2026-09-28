<script setup lang="ts">
/** Source chips under an AI answer; the numbers match the answer's `[n]` citations. */
defineProps<{
	sources: ReadonlyArray<{ index: number; title: string; url: string }>;
	newTab?: boolean;
}>();
</script>

<template>
	<div class="flex flex-wrap gap-1.5">
		<a
			v-for="source in sources"
			:key="source.index"
			:href="source.url"
			:target="newTab ? '_blank' : undefined"
			rel="noopener noreferrer"
			class="inline-flex max-w-60 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 transition hover:border-primary/40 hover:text-white"
			:title="source.title"
		>
			<span class="font-mono text-primary">{{ source.index }}</span>
			<span class="truncate">{{ hostnameOf(source.url).replace(/^www\./, "") }}</span>
		</a>
	</div>
</template>
