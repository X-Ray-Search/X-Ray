<script setup lang="ts">
import type { SearchResult } from "~/utils/types";

defineProps<{ result: SearchResult; newTab: boolean; imageProxy: boolean }>();

const thumbnailFailed = ref(false);
</script>

<template>
	<article class="flex max-w-3xl gap-4">
		<div class="min-w-0 flex-1">
			<div class="mb-1 flex min-w-0 items-center gap-2 text-sm text-slate-400">
				<SearchFavicon :url="result.url" :proxy="imageProxy" />
				<span class="truncate font-medium text-slate-300">{{ result.source ?? hostnameOf(result.url) }}</span>
				<template v-if="result.published_at">
					<span class="text-slate-600">·</span>
					<span class="shrink-0">{{ timeAgo(result.published_at) }}</span>
				</template>
			</div>
			<h3 class="text-lg leading-snug">
				<a
					:href="result.url"
					:target="newTab ? '_blank' : undefined"
					rel="noopener noreferrer"
					class="font-medium text-primary underline-offset-2 hover:underline visited:text-primary-300"
				>
					{{ result.title }}
				</a>
			</h3>
			<p v-if="result.content" class="mt-1 line-clamp-2 text-[15px] leading-relaxed text-slate-300">
				{{ result.content }}
			</p>
			<SearchEngineBadges :engines="result.engines" class="mt-2" />
		</div>

		<a
			v-if="result.thumbnail && !thumbnailFailed"
			:href="result.url"
			:target="newTab ? '_blank' : undefined"
			rel="noopener noreferrer"
			class="hidden shrink-0 self-start overflow-hidden rounded-xl border border-slate-800 sm:block"
			tabindex="-1"
		>
			<img
				:src="result.thumbnail"
				alt=""
				class="h-24 w-36 object-cover transition duration-300 hover:scale-105"
				loading="lazy"
				referrerpolicy="no-referrer"
				@error="thumbnailFailed = true"
			/>
		</a>
	</article>
</template>
