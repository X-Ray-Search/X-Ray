<script setup lang="ts">
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useSearchPreferencesStore } from "~/composables/stores/useSearchPreferencesStore";
import type { SearchPreferenceOverrides } from "~/utils/types";

definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "Search preferences | X-Ray" });

const toast = useToast();
const instanceStore = useInstanceStore();
const instance = await instanceStore.use();
const store = useSearchPreferencesStore();
await store.refresh();
const state = await store.use();

const overrides = ref<SearchPreferenceOverrides>({ ...(state.value?.overrides ?? {}) });
const saved = ref(JSON.stringify(overrides.value));
const dirty = computed(() => JSON.stringify(overrides.value) !== saved.value);
const saving = ref(false);

async function save() {
	saving.value = true;
	try {
		await store.update(overrides.value);
		overrides.value = { ...(state.value?.overrides ?? {}) };
		saved.value = JSON.stringify(overrides.value);
		toast.add({ title: "Preferences saved", icon: "i-lucide-check", color: "success" });
	} catch (error) {
		toast.add({
			title: "Could not save",
			description: (error as Error).message,
			icon: "i-lucide-alert-circle",
			color: "error",
		});
	} finally {
		saving.value = false;
	}
}

function resetAll() {
	overrides.value = {};
}

onBeforeRouteLeave(() => {
	if (dirty.value && !window.confirm("You have unsaved changes. Leave anyway?")) return false;
});
</script>

<template>
	<UDashboardPanel :ui="{ body: 'lg:py-10' }">
		<template #header>
			<DashboardPageHeader title="Search preferences" icon="i-lucide-sliders-horizontal" description="Your personal overrides">
				<template #right>
					<UButton
						label="Reset all"
						icon="i-lucide-rotate-ccw"
						color="neutral"
						variant="ghost"
						:disabled="!Object.keys(overrides).length"
						@click="resetAll"
					/>
					<UButton label="Save" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!dirty" @click="save" />
				</template>
			</DashboardPageHeader>
		</template>

		<template #body>
			<div class="mx-auto w-full max-w-3xl space-y-6">
				<UAlert
					color="neutral"
					variant="subtle"
					icon="i-lucide-info"
					title="Everything starts with the instance defaults"
					description="Settings you change here apply only to you. Anything you leave on “Instance default” follows the administrator's configuration."
				/>

				<SettingsPreferencesForm
					v-if="instance && state"
					v-model="overrides"
					mode="user"
					:defaults="state.defaults"
					:instance="instance"
					:ai-available="instance.features.ai"
				/>

				<div class="flex justify-end gap-2 pb-4">
					<UButton label="Save preferences" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!dirty" @click="save" />
				</div>
			</div>
		</template>
	</UDashboardPanel>
</template>
