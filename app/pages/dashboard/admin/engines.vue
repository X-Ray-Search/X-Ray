<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminEngine, AdminProxy, EngineType, SearchCategory } from "~/utils/types";

definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "Engines | X-Ray" });

const toast = useToast();

const [{ data: engines, loading, refresh }, { data: types }, { data: proxies }] = await Promise.all(
	[
		useAPILazyAsyncData<AdminEngine[]>("admin-engines", async () => {
			const res = await useAPI((api) => api.getAdminEngines({}));
			if (!res.success)
				toast.add({ title: "Failed to load engines", description: res.message, color: "error" });
			return res.success ? res.data : [];
		}),
		useAPILazyAsyncData<EngineType[]>("admin-engine-types", async () => {
			const res = await useAPI((api) => api.getAdminEnginesTypes({}));
			return res.success ? res.data : [];
		}),
		useAPILazyAsyncData<AdminProxy[]>("admin-proxies-for-engines", async () => {
			const res = await useAPI((api) => api.getAdminProxies({}));
			return res.success ? res.data : [];
		}),
	],
);

const typeOf = (type: string) => types.value?.find((t) => t.type === type);
const categoryLabel = (id: string) => SEARCH_CATEGORIES.find((c) => c.id === id)?.label ?? id;

const columns: TableColumn<AdminEngine>[] = [
	{ accessorKey: "name", header: "Engine" },
	{ accessorKey: "categories", header: "Categories" },
	{ id: "health", header: "Health" },
	{ accessorKey: "enabled", header: "Enabled" },
	{ id: "actions", header: "" },
];

function health(engine: AdminEngine): {
	color: "success" | "warning" | "error" | "neutral";
	label: string;
	detail: string;
} {
	if (engine.load_error)
		return { color: "error", label: "Invalid config", detail: engine.load_error };
	if (!engine.enabled) return { color: "neutral", label: "Disabled", detail: "" };
	const h = engine.health;
	if (h.suspended_until) {
		return {
			color: "warning",
			label: "Suspended",
			detail: `Until ${new Date(h.suspended_until).toLocaleTimeString()} — ${h.last_error ?? ""}`,
		};
	}
	if (h.consecutive_failures > 0)
		return { color: "error", label: "Failing", detail: h.last_error ?? "" };
	if (engine.rate_limit_per_minute && h.requests_last_minute >= engine.rate_limit_per_minute) {
		return {
			color: "warning",
			label: "Rate limited",
			detail: `${h.requests_last_minute} of ${engine.rate_limit_per_minute} requests in the last minute — serving cached results or fallbacks`,
		};
	}
	if (h.last_success_at)
		return {
			color: "success",
			label: `${h.last_latency_ms} ms`,
			detail: `Last success ${timeAgo(h.last_success_at)}${usage(engine)}`,
		};
	return { color: "neutral", label: "Not used yet", detail: "" };
}

function usage(engine: AdminEngine) {
	const used = engine.health.requests_last_minute;
	if (engine.rate_limit_per_minute)
		return ` · ${used}/${engine.rate_limit_per_minute} requests this minute`;
	return used ? ` · ${used} requests this minute` : "";
}

async function toggle(engine: AdminEngine, enabled: boolean) {
	const res = await useAPI((api) =>
		api.putAdminEnginesByEngineId({ path: { engineID: engine.id }, body: { enabled } }),
	);
	if (!res.success) {
		toast.add({ title: "Update failed", description: res.message, color: "error" });
		return;
	}
	await refresh();
}

// ------------------------------------------------------------------ editor

const editorOpen = ref(false);
const editing = ref<AdminEngine | null>(null);
const saving = ref(false);
const form = reactive({
	engine_type: "",
	slug: "",
	name: "",
	categories: [] as SearchCategory[],
	weight: 1,
	timeout_ms: 4000,
	proxy_ids: [] as number[],
	fallback: false,
	rate_limit_per_minute: 0,
	settings: {} as Record<string, any>,
});

const typeItems = computed(() =>
	(types.value ?? []).map((t) => ({ label: t.name, value: t.type, description: t.description })),
);
const selectedType = computed(() => typeOf(form.engine_type));
const proxyItems = computed(() =>
	(proxies.value ?? []).map((p) => ({ label: `${p.name} (${p.proxy_type})`, value: p.id })),
);

function openEditor(engine?: AdminEngine) {
	editing.value = engine ?? null;
	const type = engine ? typeOf(engine.engine_type) : types.value?.[0];
	Object.assign(form, {
		engine_type: engine?.engine_type ?? type?.type ?? "",
		slug: engine?.slug ?? "",
		name: engine?.name ?? type?.name ?? "",
		categories: engine ? [...engine.categories] : [...(type?.categories ?? [])],
		weight: engine?.weight ?? 1,
		timeout_ms: engine?.timeout_ms ?? type?.default_timeout_ms ?? 4000,
		proxy_ids: engine ? [...engine.proxy_ids] : [],
		fallback: engine?.fallback ?? false,
		rate_limit_per_minute: engine?.rate_limit_per_minute ?? type?.default_rate_limit_per_minute ?? 0,
		settings: engine ? { ...engine.settings } : { ...(type?.default_settings ?? {}) },
	});
	editorOpen.value = true;
}

watch(
	() => form.engine_type,
	(type, previous) => {
		if (editing.value || !previous || type === previous) return;
		const definition = typeOf(type);
		form.name = definition?.name ?? form.name;
		form.categories = [...(definition?.categories ?? [])];
		form.timeout_ms = definition?.default_timeout_ms ?? 4000;
		form.rate_limit_per_minute = definition?.default_rate_limit_per_minute ?? 0;
		form.settings = { ...(definition?.default_settings ?? {}) };
		if (!form.slug || form.slug === previous.replace(/_/g, "-")) form.slug = type.replace(/_/g, "-");
	},
);

function toggleCategory(category: SearchCategory, on: boolean) {
	form.categories = on
		? [...new Set([...form.categories, category])]
		: form.categories.filter((c) => c !== category);
}

async function save() {
	saving.value = true;
	const res = editing.value
		? await useAPI((api) =>
				api.putAdminEnginesByEngineId({
					path: { engineID: editing.value!.id },
					body: {
						slug: form.slug,
						name: form.name,
						categories: form.categories,
						weight: form.weight,
						timeout_ms: form.timeout_ms,
						proxy_ids: form.proxy_ids,
						fallback: form.fallback,
						rate_limit_per_minute: form.rate_limit_per_minute,
						settings: form.settings,
					},
				}),
			)
		: await useAPI((api) => api.postAdminEngines({ body: { ...form, enabled: true } }));
	saving.value = false;
	if (!res.success) {
		toast.add({ title: "Could not save the engine", description: res.message, color: "error" });
		return;
	}
	editorOpen.value = false;
	toast.add({
		title: editing.value ? "Engine updated" : "Engine added",
		icon: "i-lucide-check",
		color: "success",
	});
	await refresh();
}

// ------------------------------------------------------------------ test

const testOpen = ref(false);
const testTarget = ref<AdminEngine | null>(null);
const testQuery = ref("open source");
const testing = ref(false);
const testResult = ref<any>(null);

function openTest(engine: AdminEngine) {
	testTarget.value = engine;
	testResult.value = null;
	testOpen.value = true;
}

async function runTest() {
	if (!testTarget.value) return;
	testing.value = true;
	const res = await useAPI((api) =>
		api.postAdminEnginesByEngineIdTest({
			path: { engineID: testTarget.value!.id },
			body: { query: testQuery.value },
		}),
	);
	testing.value = false;
	testResult.value = res.success
		? res.data
		: { ok: false, status: "error", error: res.message, sample: [] };
	await refresh();
}

// ------------------------------------------------------------------ delete

const deleteOpen = ref(false);
const deleteTarget = ref<AdminEngine | null>(null);

async function onDelete() {
	if (!deleteTarget.value) return;
	const res = await useAPI((api) =>
		api.deleteAdminEnginesByEngineId({ path: { engineID: deleteTarget.value!.id } }),
	);
	if (!res.success) {
		toast.add({ title: "Delete failed", description: res.message, color: "error" });
		throw new Error(res.message);
	}
	toast.add({ title: "Engine deleted", color: "success" });
	await refresh();
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="Engines" icon="i-lucide-radar" description="Search backends and their health" />
		</template>

		<template #body>
			<DashboardPageBody>
				<DashboardDataTable
					:data="engines ?? []"
					:columns="columns"
					:loading="loading"
					:default-page-size="25"
					:filters="[
						{ column: 'name', type: 'text', placeholder: 'Search engines…', icon: 'i-lucide-search' },
						{
							column: 'categories',
							type: 'select',
							placeholder: 'All categories',
							icon: 'i-lucide-filter',
							options: SEARCH_CATEGORIES.map((c) => ({ label: c.label, value: c.id })),
							filterFn: (row, id, value) => !value || (row.getValue(id) as string[]).includes(value),
						},
					]"
					empty-title="No engines"
					empty-description="Add a search engine to start answering searches."
					empty-icon="i-lucide-radar"
					@refresh="refresh"
				>
					<template #header-right>
						<UButton label="Add engine" icon="i-lucide-plus" color="primary" @click="openEditor()" />
					</template>

					<template #name-cell="{ row }">
						<div class="min-w-0">
							<p class="flex items-center gap-2 font-medium text-white">
								{{ row.original.name }}
								<UBadge v-if="row.original.fallback" label="Fallback" icon="i-lucide-life-buoy" size="sm" variant="subtle" color="neutral" />
							</p>
							<p class="font-mono text-xs text-slate-500">
								{{ row.original.slug }} · {{ typeOf(row.original.engine_type)?.name ?? row.original.engine_type }}
								<span v-if="row.original.proxy_ids.length"> · {{ row.original.proxy_ids.length }} prox{{ row.original.proxy_ids.length === 1 ? "y" : "ies" }}</span>
								<span v-if="row.original.weight !== 1"> · weight {{ row.original.weight }}</span>
								<span v-if="row.original.rate_limit_per_minute"> · ≤ {{ row.original.rate_limit_per_minute }}/min</span>
							</p>
						</div>
					</template>

					<template #categories-cell="{ row }">
						<div class="flex flex-wrap gap-1">
							<UBadge v-for="c in row.original.categories" :key="c" :label="categoryLabel(c)" size="sm" variant="subtle" color="neutral" />
						</div>
					</template>

					<template #health-cell="{ row }">
						<UTooltip :text="health(row.original).detail || health(row.original).label" :disabled="!health(row.original).detail">
							<UBadge :label="health(row.original).label" :color="health(row.original).color" variant="soft" size="sm" />
						</UTooltip>
					</template>

					<template #enabled-cell="{ row }">
						<USwitch :model-value="row.original.enabled" @update:model-value="(v) => toggle(row.original, v)" />
					</template>

					<template #actions-cell="{ row }">
						<div class="flex justify-end gap-1">
							<UButton icon="i-lucide-flask-conical" color="neutral" variant="ghost" size="sm" aria-label="Test engine" @click="openTest(row.original)" />
							<UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" aria-label="Edit engine" @click="openEditor(row.original)" />
							<UButton
								icon="i-lucide-trash"
								color="error"
								variant="ghost"
								size="sm"
								aria-label="Delete engine"
								@click="
									deleteTarget = row.original;
									deleteOpen = true;
								"
							/>
						</div>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>

	<!-- Editor -->
	<DashboardModal
		v-model:open="editorOpen"
		:title="editing ? `Edit ${editing.name}` : 'Add engine'"
		icon="i-lucide-radar"
		:ui="{ content: 'sm:max-w-2xl' }"
	>
		<form class="space-y-5" @submit.prevent="save">
			<UFormField label="Type" required>
				<USelectMenu v-model="form.engine_type" :items="typeItems" value-key="value" class="w-full" :disabled="!!editing" />
			</UFormField>
			<div v-if="selectedType" class="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-400">
				{{ selectedType.description }}
				<a :href="selectedType.website" target="_blank" rel="noopener noreferrer" class="ml-1 text-primary hover:underline">Website</a>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<UFormField label="Name" required>
					<UInput v-model="form.name" class="w-full" />
				</UFormField>
				<UFormField label="Slug" description="Used in the API and the engines= filter." required>
					<UInput v-model="form.slug" class="w-full font-mono" placeholder="my-engine" />
				</UFormField>
			</div>

			<UFormField label="Categories" required>
				<div class="flex flex-wrap gap-3">
					<UCheckbox
						v-for="category in selectedType?.categories ?? []"
						:key="category"
						:label="categoryLabel(category)"
						:model-value="form.categories.includes(category)"
						@update:model-value="(v) => toggleCategory(category, v === true)"
					/>
				</div>
			</UFormField>

			<div class="grid gap-4 sm:grid-cols-2">
				<UFormField label="Weight" description="Ranking influence (1 = normal).">
					<UInputNumber v-model="form.weight" :min="0" :max="10" :step="0.1" class="w-full" />
				</UFormField>
				<UFormField label="Timeout (ms)">
					<UInputNumber v-model="form.timeout_ms" :min="500" :max="30000" :step="500" class="w-full" />
				</UFormField>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<UFormField label="Rate limit (requests/min)" description="Upstream requests per minute; 0 = unlimited. Over the limit, cached results or fallbacks are used.">
					<UInputNumber v-model="form.rate_limit_per_minute" :min="0" :max="10000" class="w-full" />
				</UFormField>
				<UFormField label="Fallback engine" description="Only query it when too few regular engines answer (Settings › Instance).">
					<USwitch v-model="form.fallback" />
				</UFormField>
			</div>

			<UFormField label="Proxies" description="Rotate through these proxies. Empty = the instance default proxies.">
				<USelectMenu
					v-model="form.proxy_ids"
					:items="proxyItems"
					value-key="value"
					multiple
					placeholder="Instance default"
					class="w-full"
				/>
			</UFormField>

			<div v-if="selectedType" class="space-y-3 border-t border-slate-800 pt-4">
				<p class="text-sm font-medium text-slate-300">Engine settings</p>
				<DashboardSchemaForm
					v-model="form.settings"
					:schema="selectedType.settings_schema"
					:secret-fields="selectedType.secret_fields"
					:secrets-set="editing?.secrets_set ?? []"
				/>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<UButton label="Cancel" color="neutral" variant="ghost" @click="editorOpen = false" />
				<UButton
					type="submit"
					:label="editing ? 'Save' : 'Add engine'"
					color="primary"
					:loading="saving"
					:disabled="!form.slug || !form.name || !form.categories.length"
				/>
			</div>
		</form>
	</DashboardModal>

	<!-- Test -->
	<DashboardModal v-model:open="testOpen" :title="`Test ${testTarget?.name ?? ''}`" icon="i-lucide-flask-conical" :ui="{ content: 'sm:max-w-2xl' }">
		<div class="space-y-4">
			<form class="flex gap-2" @submit.prevent="runTest">
				<UInput v-model="testQuery" class="flex-1" placeholder="Test query" />
				<UButton type="submit" label="Run" icon="i-lucide-play" color="primary" :loading="testing" />
			</form>

			<template v-if="testResult">
				<UAlert
					:color="testResult.ok ? 'success' : 'error'"
					variant="subtle"
					:icon="testResult.ok ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
					:title="testResult.ok ? `${testResult.results} results in ${testResult.time_ms} ms` : `Failed (${testResult.status})`"
					:description="testResult.error ?? undefined"
				/>
				<ul v-if="testResult.sample?.length" class="divide-y divide-slate-800 rounded-lg border border-slate-800">
					<li v-for="item in testResult.sample" :key="item.url" class="px-3 py-2">
						<p class="truncate text-sm text-primary">{{ item.title }}</p>
						<p class="truncate font-mono text-xs text-slate-500">{{ item.url }}</p>
					</li>
				</ul>
			</template>
		</div>
	</DashboardModal>

	<DashboardDeleteModal
		v-model:open="deleteOpen"
		title="Delete engine"
		:warning-text="`${deleteTarget?.name ?? 'This engine'} will be removed from all searches.`"
		:on-delete="onDelete"
	/>
</template>
