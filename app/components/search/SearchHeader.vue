<script setup lang="ts">
import type { SearchCategory, TimeRange } from "~/utils/types";

const props = defineProps<{
	category: SearchCategory;
	timeRange: TimeRange | null;
	imageProxy: boolean;
	disableSuggestions?: boolean;
	/** Show the "AI mode" tab (signed in and AI available). */
	aiMode?: boolean;
}>();

const emit = defineEmits<{
	submit: [query: string];
	category: [category: SearchCategory];
	timeRange: [range: TimeRange | null];
	aiMode: [];
}>();

const query = defineModel<string>({ required: true });

const timeRangeItems = TIME_RANGES.map((range) => ({ label: range.label, value: range.value }));
const selectedRange = computed({
	get: () => props.timeRange ?? "any",
	set: (value: string) => emit("timeRange", value === "any" ? null : (value as TimeRange)),
});
</script>

<template>
	<header class="sticky top-0 z-40 border-b border-slate-800/80 bg-[rgb(7_8_11/0.85)] backdrop-blur-xl">
		<!--
			From lg the logo column fills the gutter, so the search box lines up with the results. The
			name next to the icon only shows where it fits: from sm, and from lg once the gutter is wide enough.
		-->
		<div class="flex items-center gap-3 px-4 pt-3 sm:gap-6 sm:px-6 lg:gap-0 lg:px-8">
			<div class="flex shrink-0 lg:w-[calc(var(--search-gutter)-2rem)] lg:@container">
				<NuxtLink to="/" aria-label="X-Ray home">
					<ImgAppLogo
						class="h-10 [&>span:last-child]:hidden [&>span:last-child]:text-2xl sm:max-lg:[&>span:last-child]:inline @min-[8rem]:[&>span:last-child]:inline"
					/>
				</NuxtLink>
			</div>
			<div class="min-w-0 flex-1 lg:max-w-3xl">
				<SearchBox
					v-model="query"
					:image-proxy="imageProxy"
					:disable-suggestions="disableSuggestions"
					@submit="emit('submit', $event)"
				/>
			</div>
			<div class="ml-auto shrink-0">
				<LayoutAccountMenu />
			</div>
		</div>

		<div class="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 lg:pr-8 lg:pl-[calc(var(--search-gutter)-0.75rem)]">
			<nav class="flex items-center gap-1" aria-label="Search categories">
				<button
					v-if="aiMode"
					type="button"
					class="relative flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap text-slate-400 transition-colors hover:text-slate-200"
					@click="emit('aiMode')"
				>
					<UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
					AI mode
				</button>
				<button
					v-for="item in SEARCH_CATEGORIES"
					:key="item.id"
					type="button"
					class="relative flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap transition-colors"
					:class="item.id === category ? 'text-primary' : 'text-slate-400 hover:text-slate-200'"
					:aria-current="item.id === category ? 'page' : undefined"
					@click="emit('category', item.id)"
				>
					<UIcon :name="item.icon" class="size-4" />
					{{ item.label }}
					<span
						v-if="item.id === category"
						class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
					/>
				</button>
			</nav>

			<div class="ml-auto flex shrink-0 items-center py-1.5">
				<USelect
					v-model="selectedRange"
					:items="timeRangeItems"
					size="sm"
					variant="ghost"
					icon="i-lucide-calendar"
					class="w-36"
					aria-label="Time range"
				/>
			</div>
		</div>
	</header>
</template>
