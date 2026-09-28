<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminProxy, ProxyType } from "~/utils/types";

definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "Proxies | X-Ray" });

const toast = useToast();

const [{ data: proxies, loading, refresh }, { data: types }] = await Promise.all([
	useAPILazyAsyncData<AdminProxy[]>("admin-proxies", async () => {
		const res = await useAPI((api) => api.getAdminProxies({}));
		if (!res.success)
			toast.add({ title: "Failed to load proxies", description: res.message, color: "error" });
		return res.success ? res.data : [];
	}),
	useAPILazyAsyncData<ProxyType[]>("admin-proxy-types", async () => {
		const res = await useAPI((api) => api.getAdminProxiesTypes({}));
		return res.success ? res.data : [];
	}),
]);

const typeOf = (type: string) => types.value?.find((t) => t.type === type);

const columns: TableColumn<AdminProxy>[] = [
	{ accessorKey: "name", header: "Proxy" },
	{ id: "usage", header: "Used by" },
	{ accessorKey: "enabled", header: "Enabled" },
	{ id: "actions", header: "" },
];

function summary(proxy: AdminProxy) {
	const s = proxy.settings;
	if (proxy.proxy_type === "socks5") return `${s.host}:${s.port}`;
	if (proxy.proxy_type === "http" || proxy.proxy_type === "xray_gateway") return String(s.url ?? "");
	return "";
}

async function toggle(proxy: AdminProxy, enabled: boolean) {
	const res = await useAPI((api) =>
		api.putAdminProxiesByProxyId({ path: { proxyID: proxy.id }, body: { enabled } }),
	);
	if (!res.success) toast.add({ title: "Update failed", description: res.message, color: "error" });
	await refresh();
}

async function setDefault(proxy: AdminProxy, isDefault: boolean) {
	const settings = await useAPI((api) => api.getAdminSettingsInstance({}));
	if (!settings.success) return;
	const current = new Set(settings.data.default_proxy_ids);
	if (isDefault) current.add(proxy.id);
	else current.delete(proxy.id);
	const res = await useAPI((api) =>
		api.putAdminSettingsInstance({ body: { default_proxy_ids: [...current] } }),
	);
	if (!res.success) toast.add({ title: "Update failed", description: res.message, color: "error" });
	await refresh();
}

// ------------------------------------------------------------------ editor

const editorOpen = ref(false);
const editing = ref<AdminProxy | null>(null);
const saving = ref(false);
const form = reactive({ name: "", proxy_type: "", settings: {} as Record<string, any> });

const typeItems = computed(() =>
	(types.value ?? []).map((t) => ({ label: t.name, value: t.type, description: t.description })),
);
const selectedType = computed(() => typeOf(form.proxy_type));

function openEditor(proxy?: AdminProxy) {
	editing.value = proxy ?? null;
	const type = proxy ? typeOf(proxy.proxy_type) : (typeOf("socks5") ?? types.value?.[0]);
	Object.assign(form, {
		name: proxy?.name ?? "",
		proxy_type: proxy?.proxy_type ?? type?.type ?? "",
		settings: proxy ? { ...proxy.settings } : { ...(type?.default_settings ?? {}) },
	});
	testResult.value = null;
	editorOpen.value = true;
}

watch(
	() => form.proxy_type,
	(type, previous) => {
		if (editing.value || !previous || type === previous) return;
		form.settings = { ...(typeOf(type)?.default_settings ?? {}) };
	},
);

async function save() {
	saving.value = true;
	const res = editing.value
		? await useAPI((api) =>
				api.putAdminProxiesByProxyId({
					path: { proxyID: editing.value!.id },
					body: { name: form.name, settings: form.settings },
				}),
			)
		: await useAPI((api) => api.postAdminProxies({ body: { ...form, enabled: true } }));
	saving.value = false;
	if (!res.success) {
		toast.add({ title: "Could not save the proxy", description: res.message, color: "error" });
		return;
	}
	editorOpen.value = false;
	toast.add({
		title: editing.value ? "Proxy updated" : "Proxy added",
		icon: "i-lucide-check",
		color: "success",
	});
	await refresh();
}

// ------------------------------------------------------------------ test

const testing = ref<number | "form" | null>(null);
const testResult = ref<{
	ok: boolean;
	latency_ms: number;
	ip: string | null;
	error: string | null;
} | null>(null);

async function testSaved(proxy: AdminProxy) {
	testing.value = proxy.id;
	const res = await useAPI((api) =>
		api.postAdminProxiesByProxyIdTest({ path: { proxyID: proxy.id } }),
	);
	testing.value = null;
	if (!res.success) {
		toast.add({ title: "Test failed", description: res.message, color: "error" });
		return;
	}
	toast.add({
		title: res.data.ok ? `Working — exit IP ${res.data.ip ?? "unknown"}` : "Proxy test failed",
		description: res.data.ok ? `${res.data.latency_ms} ms` : (res.data.error ?? undefined),
		icon: res.data.ok ? "i-lucide-check-circle" : "i-lucide-x-circle",
		color: res.data.ok ? "success" : "error",
	});
}

async function testForm() {
	testing.value = "form";
	// Editing: test the saved proxy (secrets are not sent back to the browser).
	const res = editing.value
		? await useAPI((api) =>
				api.postAdminProxiesByProxyIdTest({ path: { proxyID: editing.value!.id } }),
			)
		: await useAPI((api) =>
				api.postAdminProxiesTest({ body: { proxy_type: form.proxy_type, settings: form.settings } }),
			);
	testing.value = null;
	testResult.value = res.success
		? res.data
		: { ok: false, latency_ms: 0, ip: null, error: res.message };
}

// ------------------------------------------------------------------ delete

const deleteOpen = ref(false);
const deleteTarget = ref<AdminProxy | null>(null);

function confirmDelete(proxy: AdminProxy) {
	deleteTarget.value = proxy;
	deleteOpen.value = true;
}

async function onDelete() {
	if (!deleteTarget.value) return;
	const res = await useAPI((api) =>
		api.deleteAdminProxiesByProxyId({ path: { proxyID: deleteTarget.value!.id } }),
	);
	if (!res.success) {
		toast.add({ title: "Delete failed", description: res.message, color: "error" });
		throw new Error(res.message);
	}
	toast.add({ title: "Proxy deleted", color: "success" });
	await refresh();
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="Proxies" icon="i-lucide-route" description="Where outbound requests leave from" />
		</template>

		<template #body>
			<DashboardPageBody>
				<UAlert
					color="neutral"
					variant="subtle"
					icon="i-lucide-info"
					title="How proxies are used"
					description="Engines rotate through their own proxies (set on the Engines page). Everything else — engines without proxies, autocomplete, instant answers, the media proxy and the bang dataset — uses the default proxies. Without any, requests leave directly from this server. If a configured proxy is disabled, requests fail instead of leaking the server's IP."
				/>

				<DashboardDataTable
					:data="proxies ?? []"
					:columns="columns"
					:loading="loading"
					empty-title="No proxies"
					empty-description="Requests currently leave directly from this server."
					empty-icon="i-lucide-route"
					@refresh="refresh"
				>
					<template #header-right>
						<UButton label="Add proxy" icon="i-lucide-plus" color="primary" @click="openEditor()" />
					</template>

					<template #name-cell="{ row }">
						<div class="min-w-0">
							<p class="flex items-center gap-2 font-medium text-white">
								{{ row.original.name }}
								<UBadge v-if="row.original.is_default" label="Default" size="sm" variant="subtle" color="primary" />
							</p>
							<p class="font-mono text-xs text-slate-500">
								{{ typeOf(row.original.proxy_type)?.name ?? row.original.proxy_type }}
								<span v-if="summary(row.original)"> · {{ summary(row.original) }}</span>
							</p>
						</div>
					</template>

					<template #usage-cell="{ row }">
						<span v-if="row.original.used_by_engines.length" class="font-mono text-xs text-slate-400">
							{{ row.original.used_by_engines.join(", ") }}
						</span>
						<span v-else class="text-xs text-slate-600">—</span>
					</template>

					<template #enabled-cell="{ row }">
						<USwitch :model-value="row.original.enabled" @update:model-value="(v) => toggle(row.original, v)" />
					</template>

					<template #actions-cell="{ row }">
						<div class="flex justify-end gap-1">
							<UButton
								icon="i-lucide-activity"
								color="neutral"
								variant="ghost"
								size="sm"
								aria-label="Test proxy"
								:loading="testing === row.original.id"
								@click="testSaved(row.original)"
							/>
							<UDropdownMenu
								:items="[
									[
										{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditor(row.original) },
										row.original.is_default
											? { label: 'Remove from defaults', icon: 'i-lucide-star-off', onSelect: () => setDefault(row.original, false) }
											: { label: 'Use as default', icon: 'i-lucide-star', onSelect: () => setDefault(row.original, true) },
									],
									[
										{
											label: 'Delete',
											icon: 'i-lucide-trash-2',
											color: 'error',
											onSelect: () => confirmDelete(row.original),
										},
									],
								]"
							>
								<UButton icon="i-lucide-more-horizontal" color="neutral" variant="ghost" size="sm" aria-label="Proxy actions" />
							</UDropdownMenu>
						</div>
					</template>
				</DashboardDataTable>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>

	<DashboardModal v-model:open="editorOpen" :title="editing ? `Edit ${editing.name}` : 'Add proxy'" icon="i-lucide-route">
		<form class="space-y-5" @submit.prevent="save">
			<UFormField label="Type" required>
				<USelectMenu v-model="form.proxy_type" :items="typeItems" value-key="value" class="w-full" :disabled="!!editing" />
			</UFormField>
			<p v-if="selectedType" class="text-sm text-slate-400">{{ selectedType.description }}</p>

			<UFormField label="Name" required>
				<UInput v-model="form.name" placeholder="Tor, VPN exit, gateway-eu…" class="w-full" />
			</UFormField>

			<div v-if="selectedType" class="border-t border-slate-800 pt-4">
				<DashboardSchemaForm
					v-model="form.settings"
					:schema="selectedType.settings_schema"
					:secret-fields="selectedType.secret_fields"
					:secrets-set="editing?.secrets_set ?? []"
				/>
			</div>

			<UAlert
				v-if="testResult"
				:color="testResult.ok ? 'success' : 'error'"
				variant="subtle"
				:icon="testResult.ok ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
				:title="testResult.ok ? `Working — exit IP ${testResult.ip ?? 'unknown'} (${testResult.latency_ms} ms)` : 'Proxy test failed'"
				:description="testResult.ok ? undefined : (testResult.error ?? undefined)"
			/>

			<div class="flex flex-wrap justify-end gap-2 pt-2">
				<UButton
					:label="editing ? 'Test saved proxy' : 'Test'"
					icon="i-lucide-activity"
					color="neutral"
					variant="soft"
					:loading="testing === 'form'"
					@click="testForm"
				/>
				<UButton label="Cancel" color="neutral" variant="ghost" @click="editorOpen = false" />
				<UButton type="submit" :label="editing ? 'Save' : 'Add proxy'" color="primary" :loading="saving" :disabled="!form.name" />
			</div>
		</form>
	</DashboardModal>

	<DashboardDeleteModal
		v-model:open="deleteOpen"
		title="Delete proxy"
		:warning-text="`${deleteTarget?.name ?? 'This proxy'} will be removed from every engine and the defaults.`"
		:on-delete="onDelete"
	/>
</template>
