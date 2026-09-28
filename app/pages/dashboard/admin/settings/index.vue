<script setup lang="ts">
import type {
	GetAdminSettingsCacheResponses,
	GetAdminSettingsInstanceResponses,
} from "~/api-client";
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import type { AdminProxy } from "~/utils/types";

type InstanceSettings = GetAdminSettingsInstanceResponses["200"]["data"];
type CacheStats = GetAdminSettingsCacheResponses["200"]["data"];

useSeoMeta({ title: "Instance settings | X-Ray" });

const toast = useToast();

const [settingsRes, proxiesRes, cacheRes] = await Promise.all([
	useAPI((api) => api.getAdminSettingsInstance({})),
	useAPI((api) => api.getAdminProxies({})),
	useAPI((api) => api.getAdminSettingsCache({})),
]);
if (!settingsRes.success) {
	throw createError({ statusCode: settingsRes.code, statusMessage: settingsRes.message });
}

const form = reactive<InstanceSettings>({ ...settingsRes.data });
const saved = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== saved.value);
const proxies = ref<AdminProxy[]>(proxiesRes.success ? proxiesRes.data : []);
const proxyItems = computed(() =>
	proxies.value.map((p) => ({ label: `${p.name} (${p.proxy_type})`, value: p.id })),
);

const accessItems = [
	{
		label: "Signed-in users only",
		value: "authenticated",
		description: "Visitors must sign in. Recommended for private instances.",
	},
	{
		label: "Anyone",
		value: "public",
		description:
			"Everyone can search; anonymous searches are rate limited per IP. AI answers stay limited to signed-in users.",
	},
];

const saving = ref(false);

async function save() {
	saving.value = true;
	const res = await useAPI((api) => api.putAdminSettingsInstance({ body: { ...form } }));
	saving.value = false;
	if (!res.success) {
		toast.add({ title: "Could not save", description: res.message, color: "error" });
		return;
	}
	Object.assign(form, res.data);
	saved.value = JSON.stringify(form);
	await Promise.all([useInstanceStore().refresh(), refreshCacheStats()]);
	toast.add({ title: "Settings saved", icon: "i-lucide-check", color: "success" });
}

const cacheStats = ref<CacheStats | null>(cacheRes.success ? cacheRes.data : null);
const hitRate = computed(() => {
	const stats = cacheStats.value;
	const lookups = (stats?.hits ?? 0) + (stats?.misses ?? 0);
	return stats && lookups ? Math.round((stats.hits / lookups) * 100) : null;
});

async function refreshCacheStats() {
	const res = await useAPI((api) => api.getAdminSettingsCache({}));
	if (res.success) cacheStats.value = res.data;
}

function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const clearing = ref(false);
async function clearCache() {
	clearing.value = true;
	const res = await useAPI((api) => api.postAdminSettingsCacheClear({}));
	clearing.value = false;
	toast.add({
		title: res.success ? "Search cache cleared" : "Failed",
		color: res.success ? "success" : "error",
	});
	await refreshCacheStats();
}

const origin = import.meta.client ? window.location.origin : "";
const searxngExample = computed(() => `${origin}/api/searxng/search?q=privacy&format=json`);

const sectionClass =
	"overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm";
const rowClass = "flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col";
</script>

<template>
	<form class="space-y-6" @submit.prevent="save">
		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">General</h3>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField label="Instance name" description="Shown on the home page and in browser search settings." :class="rowClass">
					<UInput v-model="form.instance_name" class="w-full sm:w-72" />
				</UFormField>
				<UFormField label="Who can search" :class="rowClass">
					<URadioGroup v-model="form.search_access" :items="accessItems" class="sm:w-80" />
				</UFormField>
				<UFormField
					v-if="form.search_access === 'public'"
					label="Anonymous rate limit"
					description="Searches per minute and IP for signed-out visitors (0 = unlimited). Set XRAY_TRUST_PROXY behind a reverse proxy."
					:class="rowClass"
				>
					<UInputNumber v-model="form.public_rate_limit_per_minute" :min="0" :max="10000" class="w-full sm:w-40" />
				</UFormField>
			</div>
		</section>

		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">SearXNG compatible API</h3>
				<p class="text-sm text-slate-400">For Open WebUI, Perplexica, LibreChat and other tools that speak SearXNG.</p>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField label="Enabled" :class="rowClass">
					<USwitch v-model="form.searxng_api_enabled" />
				</UFormField>
				<UFormField
					label="Require an API key"
					description="Keys are created by users under API keys. Keyless access is only possible when anyone may search."
					:class="rowClass"
				>
					<USwitch v-model="form.searxng_api_require_key" :disabled="!form.searxng_api_enabled" />
				</UFormField>
				<div v-if="form.searxng_api_enabled" class="space-y-2 py-4 last:pb-0">
					<p class="text-sm text-slate-400">Example request:</p>
					<pre class="overflow-x-auto rounded-lg bg-slate-950/70 p-3 font-mono text-xs text-slate-300">curl -H "Authorization: Bearer xray_apikey_…" \
  "{{ searxngExample }}"</pre>
					<p class="text-xs text-slate-500">
						Clients that only accept a URL can pass the key as <code class="font-mono">&amp;api_key=…</code>.
					</p>
				</div>
			</div>
		</section>

		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">Network</h3>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField
					label="Default proxies"
					description="Used by engines without their own proxies and for all other outbound requests. Empty = direct."
					:class="rowClass"
				>
					<USelectMenu
						v-model="form.default_proxy_ids"
						:items="proxyItems"
						value-key="value"
						multiple
						placeholder="Direct connection"
						class="w-full sm:w-72"
					/>
				</UFormField>
			</div>
		</section>

		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">Search cache & fallbacks</h3>
				<p class="text-sm text-slate-400">
					Every engine's answer is cached on its own, so repeated searches don't reach the engines and
					blocked or rate-limited engines fall back to earlier results.
				</p>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField
					label="Cache results for (minutes)"
					description="How long an engine's results for a query are reused. 0 turns caching off."
					:class="rowClass"
				>
					<UInputNumber v-model="form.search_cache_ttl_minutes" :min="0" :max="10080" class="w-full sm:w-40" />
				</UFormField>
				<UFormField label="News (minutes)" description="News goes stale faster." :class="rowClass">
					<UInputNumber
						v-model="form.news_cache_ttl_minutes"
						:min="0"
						:max="1440"
						class="w-full sm:w-40"
						:disabled="!form.search_cache_ttl_minutes"
					/>
				</UFormField>
				<UFormField
					label="Keep expired results as a fallback (hours)"
					description="Served while their engine is blocked, rate limited or failing. 0 = off."
					:class="rowClass"
				>
					<UInputNumber
						v-model="form.search_cache_stale_hours"
						:min="0"
						:max="720"
						class="w-full sm:w-40"
						:disabled="!form.search_cache_ttl_minutes"
					/>
				</UFormField>
				<UFormField
					label="Keep the cache on disk"
					description="Stored in search-cache.sqlite next to the database, so it survives restarts."
					:class="rowClass"
				>
					<USwitch v-model="form.search_cache_persistent" :disabled="!form.search_cache_ttl_minutes" />
				</UFormField>
				<UFormField
					label="Engines that must answer"
					description="Fallback engines (marked under Engines) are queried when fewer regular engines deliver results."
					:class="rowClass"
				>
					<UInputNumber v-model="form.min_healthy_engines" :min="1" :max="20" class="w-full sm:w-40" />
				</UFormField>
				<UFormField label="Cache" :class="rowClass">
					<template #description>
						<span v-if="cacheStats">
							{{ formatNumber(cacheStats.memory_entries) }} in memory<template v-if="cacheStats.persistent">,
								{{ formatNumber(cacheStats.disk_entries) }} on disk ({{ formatBytes(cacheStats.disk_bytes) }})</template>.
							Since the restart {{ timeAgo(cacheStats.since) }}: {{ formatNumber(cacheStats.hits) }} hits<template v-if="hitRate !== null">
								({{ hitRate }}%)</template>, {{ formatNumber(cacheStats.coalesced) }} joined requests,
							{{ formatNumber(cacheStats.stale_served) }} times served older results.
						</span>
					</template>
					<UButton label="Clear cache" icon="i-lucide-eraser" color="neutral" variant="soft" :loading="clearing" @click="clearCache" />
				</UFormField>
			</div>
		</section>

		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">DuckDuckGo bangs</h3>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField label="Update automatically" :class="rowClass">
					<USwitch v-model="form.ddg_bangs_auto_update" />
				</UFormField>
				<UFormField label="Update interval (hours)" :class="rowClass">
					<UInputNumber
						v-model="form.ddg_bangs_update_interval_hours"
						:min="1"
						:max="2160"
						class="w-full sm:w-40"
						:disabled="!form.ddg_bangs_auto_update"
					/>
				</UFormField>
			</div>
		</section>

		<div class="flex justify-end">
			<UButton type="submit" label="Save settings" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!dirty" />
		</div>
	</form>
</template>
