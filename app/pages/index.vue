<script setup lang="ts">
/** Home: logo, one search box, nothing else in the way. */
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useSearchPreferencesStore } from "~/composables/stores/useSearchPreferencesStore";

const instance = await useInstanceStore().use();
const preferences = await useSearchPreferencesStore().use();

const name = computed(() => instance.value?.name ?? "X-Ray");
const canSearch = computed(() => instance.value?.can_search ?? false);
const engineCount = computed(() => instance.value?.engines.length ?? 0);

usePageSeo({
	title: name.value,
	description: `${name.value} — a private, self-hosted meta search engine.`,
});

const query = ref("");

async function submit(value: string) {
	await navigateTo(searchLocation({ q: value }));
}

const stats = computed(() => [
	{ value: "0", label: "Ads injected" },
	{ value: "0", label: "Trackers loaded" },
	{ value: String(engineCount.value), label: "Sources queried" },
	{ value: "100%", label: "Open source" },
]);

const tips = [
	{ query: "!w black holes", label: "!w black holes", hint: "Wikipedia" },
	{ query: "!i northern lights", label: "!i northern lights", hint: "Images" },
	{ query: "100 usd in eur", label: "100 usd in eur", hint: "Currency" },
	{ query: "time in tokyo", label: "time in tokyo", hint: "Clock" },
];
</script>

<template>
	<div class="relative flex flex-1 flex-col">
		<div class="xray-grid pointer-events-none absolute inset-0" />
		<div
			class="pointer-events-none absolute top-[22%] left-1/2 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
		/>

		<LayoutHeader :show-logo="false" class="relative z-10" />

		<main class="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-24">
			<div class="flex flex-col items-center text-center">
				<ImgAppLogo :name="name" class="h-14 [&>span:last-child]:text-5xl sm:[&>span:last-child]:text-6xl" />
				<p class="mt-4 font-mono text-sm tracking-wide text-slate-400 sm:text-base">
					Unfiltered. Untracked. Unbiased.
				</p>
			</div>

			<div class="mt-10 w-full max-w-2xl">
				<SearchBox
					v-if="canSearch"
					v-model="query"
					size="lg"
					autofocus
					:image-proxy="preferences?.effective.image_proxy ?? true"
					@submit="submit"
				/>

				<div
					v-else
					class="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-6 py-8 text-center backdrop-blur"
				>
					<span class="flex size-12 items-center justify-center rounded-xl bg-primary/10">
						<UIcon name="i-lucide-lock" class="size-6 text-primary" />
					</span>
					<div>
						<p class="text-lg font-medium text-white">This instance is private</p>
						<p class="mt-1 text-sm text-slate-400">Sign in with the account your administrator gave you to start searching.</p>
					</div>
					<UButton to="/auth/login" icon="i-lucide-log-in" label="Sign in" color="primary" size="lg" />
				</div>
			</div>

			<div v-if="canSearch" class="mt-5 flex flex-wrap justify-center gap-2">
				<button
					v-for="tip in tips"
					:key="tip.query"
					type="button"
					class="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-400 transition hover:border-primary/40 hover:text-slate-200"
					@click="submit(tip.query)"
				>
					<span class="font-mono text-slate-300">{{ tip.label }}</span>
					<span class="ml-1.5 text-slate-500">{{ tip.hint }}</span>
				</button>
			</div>

			<dl class="mt-14 grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
				<div v-for="stat in stats" :key="stat.label" class="flex flex-col-reverse items-center gap-1.5">
					<dt class="font-mono text-xs text-slate-500">{{ stat.label }}</dt>
					<dd class="font-mono text-sm text-primary">{{ stat.value }}</dd>
				</div>
			</dl>
		</main>

		<LayoutFooter class="relative z-10" />
	</div>
</template>
