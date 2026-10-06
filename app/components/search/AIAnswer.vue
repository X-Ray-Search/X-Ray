<script setup lang="ts">
/**
 * AI answer card. `manual` shows an "Ask AI" button, `auto` starts streaming right away. The
 * answer is rendered with the safe mini-Markdown renderer; `[n]` citations link to the sources.
 *
 * A follow-up question switches to AI mode (`/ai`): a stored chat seeded with this answer.
 */
const props = defineProps<{
	query: string;
	mode: "manual" | "auto";
	language?: string;
	newTab: boolean;
}>();

const toast = useToast();
const { status, text, sources, model, error, ask, stop, reset } = useAIAnswer();
const expanded = ref(false);
const followUp = ref("");
const opening = ref(false);
const body = ref<HTMLElement | null>(null);
/** Whether the clamped answer is taller than its box — decided by layout, not by text length. */
const overflowing = ref(false);

const html = computed(() => renderMarkdown(text.value, sources.value));
const busy = computed(() => status.value === "loading" || status.value === "streaming");

function measure() {
	const el = body.value;
	overflowing.value = !!el && el.scrollHeight > el.clientHeight + 1;
}

let observer: ResizeObserver | null = null;
watch(body, (el, old) => {
	if (old) observer?.unobserve(old);
	if (!el) return;
	observer ??= new ResizeObserver(measure);
	observer.observe(el);
});
watch([html, expanded, busy], () => nextTick(measure), { flush: "post" });
onBeforeUnmount(() => observer?.disconnect());

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

/** Continue in AI mode, optionally sending `question` as the first follow-up. */
async function openChat(question: string | null) {
	opening.value = true;
	const response = await startAIChat(question, [
		{ role: "user", content: props.query },
		{
			role: "assistant",
			content: text.value.slice(0, 20_000),
			sources: sources.value.filter((s) => /^https?:\/\//i.test(s.url)),
		},
	]);
	opening.value = false;
	if (!response.success) {
		toast.add({
			title: "Could not open AI mode",
			description: response.message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
	}
}
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
						<UTooltip v-if="status === 'done' && text" text="Continue in AI mode">
							<UButton
								size="xs"
								color="neutral"
								variant="ghost"
								icon="i-lucide-messages-square"
								aria-label="Continue in AI mode"
								:loading="opening"
								@click="openChat(null)"
							/>
						</UTooltip>
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
						ref="body"
						class="xray-prose text-[15px] leading-relaxed text-slate-200"
						:class="!expanded && !busy ? 'max-h-72 overflow-hidden' : ''"
						v-html="html"
					/>
					<span v-if="busy" class="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
					<div
						v-if="!expanded && !busy && overflowing"
						class="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-linear-to-t from-slate-950 to-transparent"
					>
						<UButton size="sm" color="neutral" variant="soft" label="Show more" trailing-icon="i-lucide-chevron-down" @click="expanded = true" />
					</div>
				</div>

				<AiSources v-if="sources.length && status !== 'loading'" :sources="sources" :new-tab="newTab" class="mt-4" />

				<template v-if="status === 'done'">
					<AiComposer
						v-if="text"
						v-model="followUp"
						placeholder="Ask a follow-up…"
						:disabled="opening"
						class="mt-4"
						@submit="openChat"
					/>
					<p class="mt-3 text-[11px] text-slate-500">AI answers can be wrong — check the sources.</p>
				</template>
			</div>
		</template>
	</section>
</template>
