<script setup lang="ts">
/**
 * AI answer card. `manual` shows an "Ask AI" button, `auto` starts streaming right away. The
 * answer is rendered with the safe mini-Markdown renderer; `[n]` citations link to the sources.
 */
const props = defineProps<{
	query: string;
	mode: "manual" | "auto";
	language?: string;
	newTab: boolean;
}>();

const { status, text, sources, model, error, ask, stop, reset } = useAIAnswer();
const expanded = ref(false);

const html = computed(() => renderMarkdown(text.value, sources.value));
const busy = computed(() => status.value === "loading" || status.value === "streaming");

function start() {
	expanded.value = false;
	ask(props.query, props.language);
}

watch(
	() => props.query,
	() => {
		reset();
		if (props.mode === "auto") start();
	},
);

onMounted(() => {
	if (props.mode === "auto") start();
});
</script>

<template>
	<section
		class="relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/[0.07] via-slate-900/50 to-slate-950/40"
		aria-label="AI answer"
	>
		<!-- Idle (manual mode) -->
		<button
			v-if="status === 'idle'"
			type="button"
			class="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-primary/5"
			@click="start"
		>
			<span class="flex size-9 items-center justify-center rounded-lg bg-primary/15">
				<UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
			</span>
			<span class="flex-1">
				<span class="block font-medium text-white">Ask AI about this search</span>
				<span class="block text-sm text-slate-400">A short answer from the top results, with sources.</span>
			</span>
			<UIcon name="i-lucide-arrow-right" class="size-5 text-primary" />
		</button>

		<template v-else>
			<header class="flex items-center gap-2 px-5 pt-4">
				<UIcon name="i-lucide-sparkles" class="size-4 text-primary" :class="busy ? 'animate-pulse' : ''" />
				<span class="text-sm font-medium text-slate-200">AI answer</span>
				<UBadge v-if="model" :label="model" size="sm" variant="subtle" color="neutral" class="font-mono" />
				<div class="ml-auto flex items-center gap-1">
					<UButton v-if="busy" size="xs" color="neutral" variant="ghost" icon="i-lucide-square" label="Stop" @click="stop" />
					<template v-else>
						<UButton
							v-if="text"
							size="xs"
							color="neutral"
							variant="ghost"
							icon="i-lucide-copy"
							aria-label="Copy answer"
							@click="copyText(text)"
						/>
						<UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" aria-label="Regenerate" @click="start" />
					</template>
				</div>
			</header>

			<div class="px-5 pt-2 pb-4">
				<div v-if="status === 'loading'" class="space-y-2 py-1">
					<USkeleton class="h-4 w-11/12" />
					<USkeleton class="h-4 w-9/12" />
					<USkeleton class="h-4 w-10/12" />
				</div>

				<UAlert
					v-else-if="status === 'error'"
					color="error"
					variant="subtle"
					icon="i-lucide-alert-circle"
					title="The AI answer failed"
					:description="error ?? undefined"
				/>

				<div v-else class="relative">
					<div
						class="xray-prose text-[15px] leading-relaxed text-slate-200"
						:class="!expanded && !busy ? 'max-h-72 overflow-hidden' : ''"
						v-html="html"
					/>
					<span v-if="busy" class="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
					<div
						v-if="!expanded && !busy && text.length > 900"
						class="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-linear-to-t from-slate-950 to-transparent"
					>
						<UButton size="sm" color="neutral" variant="soft" label="Show more" trailing-icon="i-lucide-chevron-down" @click="expanded = true" />
					</div>
				</div>

				<div v-if="sources.length && status !== 'loading'" class="mt-4 flex flex-wrap gap-1.5">
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

				<p v-if="status === 'done'" class="mt-3 text-[11px] text-slate-500">
					AI answers can be wrong — check the sources.
				</p>
			</div>
		</template>
	</section>
</template>
