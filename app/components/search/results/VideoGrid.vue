<script setup lang="ts">
import type { SearchResult } from "~/utils/types";

defineProps<{ results: SearchResult[]; newTab: boolean; imageProxy: boolean }>();

const playing = ref<SearchResult | null>(null);
const playerOpen = computed({
	get: () => playing.value !== null,
	set: (value) => {
		if (!value) playing.value = null;
	},
});

function open(result: SearchResult, newTab: boolean) {
	// Embeds only load on an explicit click, so nothing talks to the video host before that.
	if (result.embed_url) {
		playing.value = result;
	} else {
		window.open(result.url, newTab ? "_blank" : "_self", "noopener,noreferrer");
	}
}
</script>

<template>
	<div>
		<div class="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
			<article v-for="result in results" :key="result.url" class="group min-w-0">
				<button
					type="button"
					class="relative block aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
					:aria-label="`Play ${result.title}`"
					@click="open(result, newTab)"
				>
					<img
						v-if="result.thumbnail"
						:src="result.thumbnail"
						alt=""
						class="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
					<UIcon v-else name="i-lucide-film" class="absolute inset-0 m-auto size-10 text-slate-700" />
					<span
						class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
					>
						<span class="flex size-12 items-center justify-center rounded-full bg-primary text-[#041413]">
							<UIcon name="i-lucide-play" class="size-6" />
						</span>
					</span>
					<span
						v-if="result.duration"
						class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white"
					>
						{{ result.duration }}
					</span>
				</button>
				<div class="mt-2 px-0.5">
					<h3 class="line-clamp-2 leading-snug">
						<a
							:href="result.url"
							:target="newTab ? '_blank' : undefined"
							rel="noopener noreferrer"
							class="font-medium text-slate-100 hover:text-primary"
						>
							{{ result.title }}
						</a>
					</h3>
					<p class="mt-1 truncate text-sm text-slate-400">
						{{ [result.author, result.views ? `${compactNumber(result.views)} views` : null, timeAgo(result.published_at)].filter(Boolean).join(" · ") }}
					</p>
					<p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
						<SearchFavicon :url="result.url" :proxy="imageProxy" class="scale-75" />
						{{ result.source ?? hostnameOf(result.url) }}
					</p>
				</div>
			</article>
		</div>

		<UModal
			v-model:open="playerOpen"
			:title="playing?.title ?? 'Video'"
			:ui="{ content: 'sm:max-w-4xl', body: 'p-0 sm:p-0' }"
		>
			<template #body>
				<div v-if="playing" class="aspect-video w-full bg-black">
					<iframe
						:src="`${playing.embed_url}${playing.embed_url?.includes('?') ? '&' : '?'}autoplay=1`"
						class="size-full"
						title="Video player"
						allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
						allowfullscreen
						referrerpolicy="strict-origin"
						sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
					/>
				</div>
			</template>
			<template #footer>
				<div class="flex w-full items-center justify-between gap-3">
					<span class="truncate text-sm text-slate-400">{{ playing?.author ?? playing?.source }}</span>
					<UButton
						v-if="playing"
						:to="playing.url"
						target="_blank"
						rel="noopener noreferrer"
						label="Open on site"
						icon="i-lucide-external-link"
						color="neutral"
						variant="soft"
					/>
				</div>
			</template>
		</UModal>
	</div>
</template>
