<script setup lang="ts">
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useSearchPreferencesStore } from "~/composables/stores/useSearchPreferencesStore";
import type { SearchPreferences } from "~/utils/types";

useSeoMeta({ title: "Search defaults | X-Ray" });

const toast = useToast();
const instanceStore = useInstanceStore();
const instance = await instanceStore.use();

const res = await useAPI((api) => api.getAdminSettingsSearchDefaults({}));
if (!res.success) throw createError({ statusCode: res.code, statusMessage: res.message });

const defaults: SearchPreferences = res.data;
const values = ref<Partial<SearchPreferences>>({ ...defaults });
const saved = ref(JSON.stringify(values.value));
const dirty = computed(() => JSON.stringify(values.value) !== saved.value);
const saving = ref(false);

async function save() {
	saving.value = true;
	const result = await useAPI((api) => api.putAdminSettingsSearchDefaults({ body: values.value }));
	saving.value = false;
	if (!result.success) {
		toast.add({ title: "Could not save", description: result.message, color: "error" });
		return;
	}
	values.value = { ...result.data };
	saved.value = JSON.stringify(values.value);
	await Promise.all([instanceStore.refresh(), useSearchPreferencesStore().clear()]);
	toast.add({ title: "Search defaults saved", icon: "i-lucide-check", color: "success" });
}
</script>

<template>
	<div class="space-y-6">
		<UAlert
			color="neutral"
			variant="subtle"
			icon="i-lucide-users"
			title="Defaults for everyone"
			description="These values apply to anonymous visitors and to every user who has not overridden them in their own preferences."
		/>

		<SettingsPreferencesForm
			v-if="instance"
			v-model="values"
			mode="admin"
			:defaults="defaults"
			:instance="instance"
			:ai-available="true"
		/>

		<div class="flex justify-end">
			<UButton label="Save defaults" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!dirty" @click="save" />
		</div>
	</div>
</template>
