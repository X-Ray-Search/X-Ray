<script setup lang="ts">
import type { GetAdminSettingsInstanceResponses } from "~/api-client";
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import type { AdminProxy } from "~/utils/types";

type InstanceSettings = GetAdminSettingsInstanceResponses["200"]["data"];

useSeoMeta({ title: "Instance settings | X-Ray" });

const toast = useToast();

const [settingsRes, proxiesRes] = await Promise.all([
	useAPI((api) => api.getAdminSettingsInstance({})),
	useAPI((api) => api.getAdminProxies({})),
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
	await useInstanceStore().refresh();
	toast.add({ title: "Settings saved", icon: "i-lucide-check", color: "success" });
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
				<UFormField label="Search result cache" description="Clear cached result pages (e.g. after changing engines)." :class="rowClass">
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
