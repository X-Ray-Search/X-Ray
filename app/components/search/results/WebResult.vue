<script setup lang="ts">
import type { SearchResult } from "~/utils/types";

const props = defineProps<{ result: SearchResult; newTab: boolean; imageProxy: boolean }>();

const url = computed(() => displayURL(props.result.url));
</script>

<template>
	<article class="group max-w-3xl">
		<div class="mb-1 flex min-w-0 items-center gap-2.5 text-sm">
			<SearchFavicon :url="result.url" :proxy="imageProxy" />
			<a
				:href="result.url"
				:target="newTab ? '_blank' : undefined"
				rel="noopener noreferrer"
				class="min-w-0 truncate font-mono text-[13px] text-slate-400 hover:text-slate-300"
			>
				<span class="text-slate-300">{{ url.host }}</span>{{ url.path }}
			</a>
			<span class="hidden text-slate-600 sm:inline">·</span>
			<SearchEngineBadges :engines="result.engines" class="hidden shrink-0 sm:inline-flex" />
		</div>

		<h3 class="text-lg leading-snug sm:text-xl">
			<a
				:href="result.url"
				:target="newTab ? '_blank' : undefined"
				rel="noopener noreferrer"
				class="font-medium text-primary decoration-primary/50 underline-offset-2 hover:underline visited:text-primary-300"
			>
				{{ result.title }}
			</a>
		</h3>

		<p v-if="result.content || result.published_at" class="mt-1 line-clamp-3 text-[15px] leading-relaxed text-slate-300">
			<span v-if="result.published_at" class="text-slate-500">{{ timeAgo(result.published_at) }} — </span>
			{{ result.content }}
		</p>
	</article>
</template>
