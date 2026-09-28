<script setup lang="ts">
definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "Instance bangs | X-Ray" });

const toast = useToast();

const { data: dataset, refresh: refreshDataset } = await useAPILazyAsyncData(
	"admin-bang-dataset",
	async () => {
		const res = await useAPI((api) => api.getAdminBangsDataset({}));
		return res.success ? res.data : null;
	},
);

const refreshing = ref(false);

async function updateDataset() {
	refreshing.value = true;
	const res = await useAPI((api) => api.postAdminBangsDatasetRefresh({}));
	refreshing.value = false;
	if (!res.success) {
		toast.add({ title: "Update failed", description: res.message, color: "error" });
		return;
	}
	await refreshDataset();
	toast.add({
		title: res.data.last_error ? "Update failed" : `Loaded ${formatNumber(res.data.count)} bangs`,
		description: res.data.last_error ?? undefined,
		color: res.data.last_error ? "error" : "success",
	});
}
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="Instance bangs" icon="i-lucide-zap" description="Shortcuts for everyone on this instance" />
		</template>

		<template #body>
			<DashboardPageBody>
				<div class="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 sm:flex-row sm:items-center">
					<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
						<UIcon name="i-lucide-database" class="size-5 text-primary" />
					</div>
					<div class="flex-1">
						<p class="font-medium text-white">DuckDuckGo bang dataset</p>
						<p class="text-sm text-slate-400">
							<template v-if="dataset?.count">
								{{ formatNumber(dataset.count) }} bangs · updated {{ timeAgo(dataset.updated_at) }}
							</template>
							<template v-else>Not downloaded yet.</template>
							<span v-if="dataset?.last_error" class="text-red-400"> · Last update failed: {{ dataset.last_error }}</span>
						</p>
						<p class="mt-1 text-xs text-slate-500">
							Automatic updates are configured under Settings. Instance bangs below override DuckDuckGo bangs with the same trigger.
						</p>
					</div>
					<UButton label="Update now" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="updateDataset" />
				</div>

				<DashboardBangsManager scope="instance" />
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
