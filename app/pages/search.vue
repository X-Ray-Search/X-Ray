<script setup lang="ts">
/**
 * Search results. The URL is the state (`/search?q=…&category=…&page=…&time_range=…`), so every
 * search is shareable and works from the browser address bar (see /opensearch.xml).
 *
 * Bangs resolve on the server: during SSR a matching bang becomes a plain HTTP redirect.
 */
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useSearchPreferencesStore } from "~/composables/stores/useSearchPreferencesStore";
import type { SearchCategory, SearchResult, TimeRange } from "~/utils/types";

const route = useRoute();
const instance = await useInstanceStore().use();
const preferences = await useSearchPreferencesStore().use();

const CATEGORIES = SEARCH_CATEGORIES.map((c) => c.id);
const RANGES = ["day", "week", "month", "year"] as const;

const params = computed(() => {
	const category = String(route.query.category ?? "");
	const range = String(route.query.time_range ?? "");
	return {
		q: String(route.query.q ?? "")
			.trim()
			.slice(0, 500),
		category: (CATEGORIES as string[]).includes(category) ? (category as SearchCategory) : undefined,
		page: Math.min(Math.max(Number.parseInt(String(route.query.page ?? "1"), 10) || 1, 1), 20),
		time_range: (RANGES as readonly string[]).includes(range) ? (range as TimeRange) : undefined,
	};
});

if (!params.value.q) {
	await navigateTo("/", { replace: true });
}

const draft = ref(params.value.q);
watch(
	() => params.value.q,
	(q) => {
		draft.value = q;
	},
);

const { data: response, loading } = await useAPIAsyncData(
	() =>
		`search|${params.value.q}|${params.value.category ?? ""}|${params.value.page}|${params.value.time_range ?? ""}`,
	async () => {
		const p = params.value;
		if (!p.q) return null;
		return await useAPI(
			(api) =>
				api.getSearch({
					query: { q: p.q, category: p.category, page: p.page, time_range: p.time_range },
				}),
			true,
		);
	},
);

const result = computed(() => (response.value?.success ? response.value.data : null));
const failure = computed(() => (response.value && !response.value.success ? response.value : null));

// Signed-out visitors of a private instance never get here (auth.global.ts sends them to the
// login page); this covers a session that expires while searching.
async function requireSignIn() {
	if (failure.value?.code !== 401) return;
	await navigateTo(`/auth/login?url=${encodeURIComponent(route.fullPath)}`, { replace: true });
}
await requireSignIn();
watch(failure, requireSignIn);

/** Follow bang redirects (external) and category switches (`!i cats`). */
async function followRedirects() {
	const data = result.value;
	if (!data) return;
	if (data.redirect) {
		await navigateTo(data.redirect.url, { external: true, replace: true, redirectCode: 302 });
	} else if (data.category_redirect && data.category_redirect !== params.value.category) {
		await navigateTo(
			searchLocation({
				q: data.query,
				category: data.category_redirect,
				time_range: params.value.time_range,
			}),
			{ replace: true },
		);
	}
}
await followRedirects();
watch(result, followRedirects);

const prefs = computed(() => preferences.value?.effective);
const newTab = computed(() => prefs.value?.open_in_new_tab ?? false);
const imageProxy = computed(() => prefs.value?.image_proxy ?? true);
const category = computed<SearchCategory>(
	() =>
		result.value?.category ?? params.value.category ?? prefs.value?.default_category ?? "general",
);
const isGrid = computed(() => category.value === "images" || category.value === "videos");

// ------------------------------------------------------------------ load more (grids)

const extra = ref<SearchResult[]>([]);
const extraPages = ref(0);
const loadingMore = ref(false);
const exhausted = ref(false);

watch(
	() => JSON.stringify(params.value),
	() => {
		extra.value = [];
		extraPages.value = 0;
		exhausted.value = false;
	},
);

const results = computed(() => {
	const base = result.value?.results ?? [];
	if (!extra.value.length) return base;
	const seen = new Set(base.map((r) => r.url + (r.img_src ?? "")));
	return [...base, ...extra.value.filter((r) => !seen.has(r.url + (r.img_src ?? "")))];
});

async function loadMore() {
	if (loadingMore.value || exhausted.value) return;
	loadingMore.value = true;
	const p = params.value;
	const page = p.page + extraPages.value + 1;
	const res = await useAPI(
		(api) =>
			api.getSearch({ query: { q: p.q, category: category.value, page, time_range: p.time_range } }),
		true,
	);
	loadingMore.value = false;
	if (!res.success || !res.data.results.length || page >= 20) {
		exhausted.value = true;
		return;
	}
	const before = results.value.length;
	extra.value = [...extra.value, ...res.data.results];
	extraPages.value++;
	if (results.value.length === before) exhausted.value = true;
}

// ------------------------------------------------------------------ navigation

function search(overrides: {
	q?: string;
	category?: SearchCategory;
	page?: number;
	time_range?: TimeRange | null;
}) {
	const next = {
		q: overrides.q ?? params.value.q,
		category: overrides.category ?? params.value.category,
		page: overrides.page,
		time_range:
			overrides.time_range === null ? undefined : (overrides.time_range ?? params.value.time_range),
	};
	return navigateTo(searchLocation(next));
}

function goToPage(page: number) {
	search({ page, category: category.value });
	if (import.meta.client) window.scrollTo({ top: 0, behavior: "smooth" });
}

// "/" focuses the search box, like on most search engines.
function onKeydown(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	if (event.key !== "/" || target?.closest("input, textarea, [contenteditable]")) return;
	event.preventDefault();
	document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// ------------------------------------------------------------------ derived display state

const topAnswers = computed(
	() => result.value?.instant_answers.filter((a) => a.placement === "top") ?? [],
);
const sideAnswers = computed(
	() => result.value?.instant_answers.filter((a) => a.placement === "side") ?? [],
);
const showAI = computed(
	() =>
		!!result.value?.ai_available &&
		category.value === "general" &&
		params.value.page === 1 &&
		(prefs.value?.ai_mode ?? "off") !== "off",
);
// AI answers are for signed-in users only (also on public instances).
const aiModeAvailable = computed(
	() =>
		!!instance.value?.features.ai &&
		!!instance.value?.authenticated &&
		(prefs.value?.ai_mode ?? "off") !== "off",
);
function openAIMode() {
	return navigateTo({ path: "/ai", query: { q: params.value.q } });
}
const allEnginesFailed = computed(
	() => !!result.value?.engines.length && result.value.engines.every((e) => e.status !== "ok"),
);
const relatedSearches = computed(() => (result.value?.suggestions ?? []).slice(0, 8));

useSeoMeta({
	title: () => (params.value.q ? `${params.value.q} – ${instance.value?.name ?? "X-Ray"}` : "X-Ray"),
	robots: "noindex, nofollow",
});
</script>

<template>
	<div class="flex flex-1 flex-col">
		<SearchHeader
			v-model="draft"
			:category="category"
			:time-range="params.time_range ?? null"
			:image-proxy="imageProxy"
			:disable-suggestions="failure?.code === 401"
			:ai-mode="aiModeAvailable"
			@submit="(q) => search({ q, page: 1 })"
			@category="(c) => search({ category: c, page: 1 })"
			@time-range="(t) => search({ time_range: t, page: 1, category: category })"
			@ai-mode="openAIMode"
		/>

		<main class="flex-1 px-4 py-6 sm:px-6 lg:pr-8 lg:pl-(--search-gutter)">
			<!-- Errors (401 redirects to the login page, see requireSignIn) -->
			<UAlert
				v-if="failure && failure.code !== 401"
				:color="failure.code === 429 ? 'warning' : 'error'"
				variant="subtle"
				:icon="failure.code === 429 ? 'i-lucide-hourglass' : 'i-lucide-alert-circle'"
				:title="failure.code === 429 ? 'Slow down a little' : 'Search failed'"
				:description="failure.message"
				class="max-w-3xl"
			/>

			<!-- Loading (client-side navigation) -->
			<div v-else-if="loading && !result" class="max-w-3xl space-y-8">
				<USkeleton class="h-4 w-64" />
				<div v-for="n in 5" :key="n" class="space-y-2">
					<USkeleton class="h-4 w-48" />
					<USkeleton class="h-6 w-96 max-w-full" />
					<USkeleton class="h-4 w-full" />
				</div>
			</div>

			<template v-else-if="result && !result.redirect">
				<div :class="{ 'opacity-60 transition-opacity': loading }">
					<SearchResultMeta
						:count="result.number_of_results"
						:time-ms="result.time_ms"
						:engines="result.engines"
						:cached="result.cached"
						class="mb-5"
					/>

					<p v-if="result.corrections.length" class="mb-5 text-slate-300">
						Did you mean
						<button
							type="button"
							class="font-medium text-primary italic hover:underline"
							@click="search({ q: result.corrections[0], page: 1 })"
						>
							{{ result.corrections[0] }}
						</button>
						?
					</p>

					<!-- Grids: images & videos -->
					<template v-if="isGrid">
						<SearchResultsImageGrid
							v-if="category === 'images'"
							:results="results"
							:new-tab="newTab"
							:image-proxy="imageProxy"
						/>
						<SearchResultsVideoGrid v-else :results="results" :new-tab="newTab" :image-proxy="imageProxy" />

						<div v-if="results.length && !exhausted" class="mt-10 flex justify-center">
							<UButton
								label="Load more"
								icon="i-lucide-chevrons-down"
								color="neutral"
								variant="soft"
								size="lg"
								:loading="loadingMore"
								@click="loadMore"
							/>
						</div>
					</template>

					<!-- Lists: general & news -->
					<div v-else class="grid gap-10 xl:grid-cols-[minmax(0,48rem)_minmax(0,22rem)]">
						<div class="min-w-0 space-y-6">
							<SearchInstantAnswer v-for="answer in topAnswers" :key="answer.provider" :answer="answer" />

							<SearchAIAnswer
								v-if="showAI"
								:key="result.query"
								:query="result.query"
								:mode="prefs?.ai_mode === 'auto' ? 'auto' : 'manual'"
								:new-tab="newTab"
							/>

							<div class="xl:hidden">
								<SearchInstantWikipediaPanel
									v-for="answer in sideAnswers"
									:key="answer.provider"
									:answer="answer"
									:new-tab="newTab"
								/>
							</div>

							<div v-if="results.length" class="space-y-7">
								<template v-for="item in results" :key="item.url">
									<SearchResultsNewsResult
										v-if="category === 'news'"
										:result="item"
										:new-tab="newTab"
										:image-proxy="imageProxy"
									/>
									<SearchResultsWebResult v-else :result="item" :new-tab="newTab" :image-proxy="imageProxy" />
								</template>
							</div>

							<div v-if="relatedSearches.length" class="border-t border-slate-800/80 pt-6">
								<h2 class="mb-3 text-sm font-medium text-slate-400">Related searches</h2>
								<div class="flex flex-wrap gap-2">
									<button
										v-for="suggestion in relatedSearches"
										:key="suggestion"
										type="button"
										class="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3.5 py-1.5 text-sm text-slate-300 transition hover:border-primary/40 hover:text-white"
										@click="search({ q: suggestion, page: 1 })"
									>
										<UIcon name="i-lucide-search" class="size-3.5 text-slate-500" />
										{{ suggestion }}
									</button>
								</div>
							</div>

							<SearchPager
								v-if="results.length"
								:page="params.page"
								:has-more="results.length >= 5"
								class="pt-2"
								@go="goToPage"
							/>
						</div>

						<aside class="hidden space-y-6 xl:block">
							<SearchInstantWikipediaPanel
								v-for="answer in sideAnswers"
								:key="answer.provider"
								:answer="answer"
								:new-tab="newTab"
							/>
						</aside>
					</div>

					<!-- Nothing found -->
					<div v-if="!results.length && !topAnswers.length" class="mt-6 max-w-2xl">
						<UAlert
							v-if="allEnginesFailed"
							color="warning"
							variant="subtle"
							icon="i-lucide-server-crash"
							title="No engine answered"
							description="Every search engine failed or was blocked. Try again in a minute — administrators can check the engine status in the dashboard."
						/>
						<UEmpty
							v-else
							icon="i-lucide-search-x"
							:title="`No results for “${result.query}”`"
							description="Try different or fewer keywords, another category, or a wider time range."
							variant="naked"
						/>
					</div>
				</div>
			</template>
		</main>

		<LayoutFooter />
	</div>
</template>
