<script setup lang="ts">
/**
 * CRUD table for custom bangs — personal (`/account/bangs`) or instance-wide (`/admin/bangs`).
 */
import type { TableColumn } from "@nuxt/ui";
import type { CustomBang } from "~/utils/types";

const props = defineProps<{ scope: "personal" | "instance" }>();
const toast = useToast();

const api = {
	list: () =>
		props.scope === "personal"
			? useAPI((a) => a.getAccountBangs({}))
			: useAPI((a) => a.getAdminBangs({})),
	create: (body: BangForm) =>
		props.scope === "personal"
			? useAPI((a) => a.postAccountBangs({ body }))
			: useAPI((a) => a.postAdminBangs({ body })),
	update: (bangID: number, body: BangForm) =>
		props.scope === "personal"
			? useAPI((a) => a.putAccountBangsByBangId({ path: { bangID }, body }))
			: useAPI((a) => a.putAdminBangsByBangId({ path: { bangID }, body })),
	remove: (bangID: number) =>
		props.scope === "personal"
			? useAPI((a) => a.deleteAccountBangsByBangId({ path: { bangID } }))
			: useAPI((a) => a.deleteAdminBangsByBangId({ path: { bangID } })),
};

interface BangForm {
	trigger: string;
	name: string;
	url_template: string;
	category: string | null;
}

const {
	data: bangs,
	loading,
	refresh,
} = await useAPILazyAsyncData<CustomBang[]>(`bangs-${props.scope}`, async () => {
	const res = await api.list();
	if (!res.success) {
		toast.add({ title: "Failed to load bangs", description: res.message, color: "error" });
		return [];
	}
	return res.data;
});

const columns: TableColumn<CustomBang>[] = [
	{ accessorKey: "trigger", header: "Bang" },
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "url_template", header: "Target" },
	{ id: "actions", header: "" },
];

// ------------------------------------------------------------------ editor

const editorOpen = ref(false);
const editing = ref<CustomBang | null>(null);
const saving = ref(false);
const form = reactive<BangForm>({ trigger: "", name: "", url_template: "", category: null });

function openEditor(bang?: CustomBang) {
	editing.value = bang ?? null;
	Object.assign(form, {
		trigger: bang?.trigger ?? "",
		name: bang?.name ?? "",
		url_template: bang?.url_template ?? "https://example.org/search?q={{{s}}}",
		category: bang?.category ?? null,
	});
	editorOpen.value = true;
}

const preview = computed(() => {
	const template = form.url_template.trim();
	if (!template) return "";
	return template.replace(/\{\{\{s\}\}\}|%s/g, encodeURIComponent("example query"));
});

const templateValid = computed(() => {
	try {
		const url = new URL(form.url_template.replace(/\{\{\{s\}\}\}|%s/g, "x"));
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
});

async function save() {
	saving.value = true;
	const body = {
		...form,
		trigger: form.trigger.replace(/^!/, "").trim().toLowerCase(),
		category: form.category || null,
	};
	const res = editing.value ? await api.update(editing.value.id, body) : await api.create(body);
	saving.value = false;
	if (!res.success) {
		toast.add({ title: "Could not save the bang", description: res.message, color: "error" });
		return;
	}
	editorOpen.value = false;
	toast.add({
		title: editing.value ? "Bang updated" : "Bang created",
		icon: "i-lucide-check",
		color: "success",
	});
	await refresh();
}

// ------------------------------------------------------------------ delete

const deleteOpen = ref(false);
const deleteTarget = ref<CustomBang | null>(null);

async function onDelete() {
	if (!deleteTarget.value) return;
	const res = await api.remove(deleteTarget.value.id);
	if (!res.success) {
		toast.add({ title: "Delete failed", description: res.message, color: "error" });
		throw new Error(res.message);
	}
	toast.add({ title: "Bang deleted", color: "success" });
	await refresh();
}
</script>

<template>
	<div>
		<DashboardDataTable
			:data="bangs ?? []"
			:columns="columns"
			:loading="loading"
			:filters="[{ column: 'trigger', type: 'text', placeholder: 'Search bangs…', icon: 'i-lucide-search' }]"
			empty-title="No custom bangs yet"
			:empty-description="scope === 'personal' ? 'Create shortcuts only you can use — they win over every other bang.' : 'Instance bangs are available to everyone and override DuckDuckGo bangs.'"
			empty-icon="i-lucide-zap"
			@refresh="refresh"
		>
			<template #header-right>
				<UButton label="New bang" icon="i-lucide-plus" color="primary" @click="openEditor()" />
			</template>

			<template #trigger-cell="{ row }">
				<span class="font-mono text-primary">!{{ row.original.trigger }}</span>
			</template>

			<template #url_template-cell="{ row }">
				<span class="line-clamp-1 max-w-md font-mono text-xs text-slate-400">{{ row.original.url_template }}</span>
			</template>

			<template #actions-cell="{ row }">
				<div class="flex justify-end gap-1">
					<UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" aria-label="Edit bang" @click="openEditor(row.original)" />
					<UButton
						icon="i-lucide-trash"
						color="error"
						variant="ghost"
						size="sm"
						aria-label="Delete bang"
						@click="
							deleteTarget = row.original;
							deleteOpen = true;
						"
					/>
				</div>
			</template>

			<template #empty-actions>
				<UButton label="Create a bang" color="primary" @click="openEditor()" />
			</template>
		</DashboardDataTable>

		<DashboardModal v-model:open="editorOpen" :title="editing ? 'Edit bang' : 'New bang'" icon="i-lucide-zap">
			<form class="space-y-4" @submit.prevent="save">
				<UFormField label="Trigger" description="What you type after the !, e.g. gh for !gh." required>
					<UInput v-model="form.trigger" placeholder="gh" class="w-full font-mono" autocomplete="off">
						<template #leading><span class="font-mono text-slate-500">!</span></template>
					</UInput>
				</UFormField>
				<UFormField label="Name" required>
					<UInput v-model="form.name" placeholder="GitHub" class="w-full" />
				</UFormField>
				<UFormField
					label="URL template"
					description="Use {{{s}}} (or %s) where the search terms go."
					required
					:error="form.url_template && !templateValid ? 'Must be an http(s) URL' : undefined"
				>
					<UInput v-model="form.url_template" placeholder="https://github.com/search?q={{{s}}}" class="w-full font-mono text-xs" />
				</UFormField>
				<p v-if="preview && templateValid" class="truncate rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-400">
					→ {{ preview }}
				</p>
				<div class="flex justify-end gap-2 pt-2">
					<UButton label="Cancel" color="neutral" variant="ghost" @click="editorOpen = false" />
					<UButton
						type="submit"
						:label="editing ? 'Save' : 'Create'"
						color="primary"
						:loading="saving"
						:disabled="!form.trigger || !form.name || !templateValid"
					/>
				</div>
			</form>
		</DashboardModal>

		<DashboardDeleteModal
			v-model:open="deleteOpen"
			title="Delete bang"
			:warning-text="`!${deleteTarget?.trigger ?? ''} will stop working.`"
			:on-delete="onDelete"
		/>
	</div>
</template>
