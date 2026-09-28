<script setup lang="ts">
import type { SearchCategory, TimeRange } from "~/utils/types";

const props = defineProps<{
	category: SearchCategory;
	timeRange: TimeRange | null;
	imageProxy: boolean;
	disableSuggestions?: boolean;
}>();

const emit = defineEmits<{
	submit: [query: string];
	category: [category: SearchCategory];
	timeRange: [range: TimeRange | null];
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
		<div class="flex items-center gap-3 px-4 pt-3 sm:gap-6 sm:px-6 lg:px-8">
			<NuxtLink to="/" class="shrink-0" aria-label="X-Ray home">
				<ImgAppIcon class="size-10" />
			</NuxtLink>
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

		<div class="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 lg:pl-[5.5rem]">
			<nav class="flex items-center gap-1" aria-label="Search categories">
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
