<script setup lang="ts">
import type { SearchResult } from "~/utils/types";

const props = defineProps<{ results: SearchResult[]; newTab: boolean; imageProxy: boolean }>();

const failed = reactive(new Set<string>());
const visible = computed(() => props.results.filter((r) => !failed.has(r.url + (r.img_src ?? ""))));

const openIndex = ref<number | null>(null);
const current = computed(() =>
	openIndex.value === null ? null : (visible.value[openIndex.value] ?? null),
);
const previewOpen = computed({
	get: () => openIndex.value !== null,
	set: (value) => {
		if (!value) openIndex.value = null;
	},
});

function step(delta: number) {
	if (openIndex.value === null || !visible.value.length) return;
	openIndex.value = (openIndex.value + delta + visible.value.length) % visible.value.length;
}

function onKeydown(event: KeyboardEvent) {
	if (openIndex.value === null) return;
	if (event.key === "ArrowRight") step(1);
	else if (event.key === "ArrowLeft") step(-1);
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
	<div>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
			<button
				v-for="(result, index) in visible"
				:key="result.url + (result.img_src ?? '')"
				type="button"
				class="group flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-left transition hover:-translate-y-0.5 hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none"
				@click="openIndex = index"
			>
				<div class="aspect-square w-full overflow-hidden rounded-lg bg-slate-800/60">
					<img
						:src="result.thumbnail ?? result.img_src ?? ''"
						:alt="result.title"
						class="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
						loading="lazy"
						referrerpolicy="no-referrer"
						@error="failed.add(result.url + (result.img_src ?? ''))"
					/>
				</div>
				<div class="px-1 pt-2 pb-0.5">
					<p class="line-clamp-2 text-sm leading-snug text-slate-200">{{ result.title }}</p>
					<p class="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
						<UIcon name="i-lucide-external-link" class="size-3 shrink-0" />
						<span class="truncate">{{ result.source ?? hostnameOf(result.url) }}</span>
					</p>
				</div>
			</button>
		</div>

		<UModal
			v-model:open="previewOpen"
			:title="current?.title ?? 'Image'"
			:ui="{ content: 'sm:max-w-5xl', body: 'p-0 sm:p-0' }"
		>
			<template #body>
				<div v-if="current" class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div class="relative flex min-h-64 items-center justify-center bg-black/60">
						<img
							:key="current.img_src ?? current.thumbnail ?? ''"
							:src="current.img_src ?? current.thumbnail ?? ''"
							:alt="current.title"
							class="max-h-[70vh] w-auto max-w-full object-contain"
							referrerpolicy="no-referrer"
							@error="($event.target as HTMLImageElement).src = current?.thumbnail ?? ''"
						/>
						<UButton
							icon="i-lucide-chevron-left"
							color="neutral"
							variant="soft"
							class="absolute left-3 rounded-full"
							aria-label="Previous image"
							@click="step(-1)"
						/>
						<UButton
							icon="i-lucide-chevron-right"
							color="neutral"
							variant="soft"
							class="absolute right-3 rounded-full"
							aria-label="Next image"
							@click="step(1)"
						/>
					</div>
					<div class="space-y-4 p-5">
						<div>
							<p class="font-medium text-white">{{ current.title }}</p>
							<p class="mt-1 flex items-center gap-2 text-sm text-slate-400">
								<SearchFavicon :url="current.url" :proxy="imageProxy" />
								<span class="truncate">{{ current.source ?? hostnameOf(current.url) }}</span>
							</p>
						</div>
						<dl class="space-y-1 text-sm">
							<div v-if="current.width && current.height" class="flex justify-between gap-2">
								<dt class="text-slate-500">Size</dt>
								<dd class="font-mono text-slate-300">{{ current.width }} × {{ current.height }}</dd>
							</div>
							<div class="flex justify-between gap-2">
								<dt class="text-slate-500">Found by</dt>
								<dd><SearchEngineBadges :engines="current.engines" /></dd>
							</div>
						</dl>
						<div class="flex flex-col gap-2">
							<UButton
								:to="current.url"
								:target="newTab ? '_blank' : undefined"
								rel="noopener noreferrer"
								label="Visit page"
								icon="i-lucide-external-link"
								color="primary"
								block
							/>
							<UButton
								v-if="current.img_src"
								:to="current.img_src"
								target="_blank"
								rel="noopener noreferrer"
								label="Open image"
								icon="i-lucide-image"
								color="neutral"
								variant="soft"
								block
							/>
						</div>
					</div>
				</div>
			</template>
		</UModal>
	</div>
</template>
