<script setup lang="ts">
/** One answer in an AI chat: the web search it is grounded in (if any), the Markdown and its sources. */
const props = withDefaults(
	defineProps<{
		text: string;
		sources: ReadonlyArray<{ index: number; title: string; url: string }>;
		searchQuery: string | null;
		status?: "searching" | "streaming" | "done" | "error";
		error?: string | null;
		newTab?: boolean;
	}>(),
	{ status: "done", error: null, newTab: false },
);

const emit = defineEmits<{ retry: [] }>();

const html = computed(() => renderMarkdown(props.text, props.sources));
const busy = computed(() => props.status === "searching" || props.status === "streaming");
</script>

<template>
	<div class="flex gap-3">
		<span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
			<UIcon name="i-lucide-sparkles" class="size-4 text-primary" :class="busy ? 'animate-pulse' : ''" />
		</span>

		<div class="min-w-0 flex-1">
			<p v-if="searchQuery" class="mb-2 flex min-h-7 items-center gap-1.5 text-xs text-slate-500">
				<UIcon name="i-lucide-search" class="size-3.5 shrink-0" />
				<span class="truncate">
					{{ status === "searching" ? "Searching for" : "Searched for" }}
					<NuxtLink
						:to="searchLocation({ q: searchQuery })"
						class="text-slate-400 transition hover:text-primary"
						title="Show the web results"
					>
						“{{ searchQuery }}”
					</NuxtLink>
				</span>
			</p>
			<!-- Before the search decision arrives, and for answers made without a web search. -->
			<p v-else-if="status !== 'error'" class="mb-2 flex min-h-7 items-center gap-1.5 text-xs text-slate-500">
				<template v-if="status === 'searching'">Thinking…</template>
				<template v-else>
					<UIcon name="i-lucide-messages-square" class="size-3.5 shrink-0" />
					From the conversation, no web search
				</template>
			</p>

			<div v-if="status === 'searching'" class="space-y-2 py-1">
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
				:actions="[{ label: 'Try again', icon: 'i-lucide-refresh-cw', color: 'neutral', variant: 'soft', onClick: () => emit('retry') }]"
			/>

			<div v-else>
				<div class="xray-prose text-[15px] leading-relaxed text-slate-200" v-html="html" />
				<span v-if="busy" class="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
			</div>

			<AiSources v-if="sources.length && status !== 'searching'" :sources="sources" :new-tab="newTab" class="mt-4" />

			<div v-if="status === 'done' && text" class="mt-2 -ml-2 flex items-center gap-1">
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					icon="i-lucide-copy"
					aria-label="Copy answer"
					@click="copyText(text)"
				/>
			</div>
		</div>
	</div>
</template>
