<script setup lang="ts">
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useUserInfoStore } from "~/composables/stores/useUserStore";
import type { AdminEngine } from "~/utils/types";

definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "Dashboard | X-Ray" });

const userInfoStore = useUserInfoStore();
const user = await userInfoStore.use();
if (!userInfoStore.isValid(user)) {
	throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
}
const instance = await useInstanceStore().use();
const isAdmin = computed(() => user.value.role === "admin");

const { data: engines, loading: loadingEngines } = await useAPILazyAsyncData<AdminEngine[]>(
	"dashboard-engines",
	async () => {
		if (!isAdmin.value) return [];
		const res = await useAPI((api) => api.getAdminEngines({}));
		return res.success ? res.data : [];
	},
);

const engineStats = computed(() => {
	const list = (engines.value ?? []).filter((e) => e.enabled);
	return {
		enabled: list.length,
		healthy: list.filter(
			(e) => !e.health.suspended_until && e.health.consecutive_failures === 0 && !e.load_error,
		).length,
		problems: list.filter(
			(e) => e.health.suspended_until || e.health.consecutive_failures > 0 || e.load_error,
		),
	};
});

const quickActions = computed(() => [
	{
		label: "Search preferences",
		description: "Language, safe search, AI answers",
		icon: "i-lucide-sliders-horizontal",
		to: "/dashboard/preferences",
	},
	{
		label: "My bangs",
		description: "Personal !shortcuts",
		icon: "i-lucide-zap",
		to: "/dashboard/bangs",
	},
	{
		label: "API keys",
		description: "SearXNG API & scripts",
		icon: "i-lucide-key",
		to: "/dashboard/apikeys",
	},
	...(isAdmin.value
		? [
				{
					label: "Engines",
					description: "Backends and health",
					icon: "i-lucide-radar",
					to: "/dashboard/admin/engines",
				},
				{
					label: "Proxies",
					description: "Outbound routing",
					icon: "i-lucide-route",
					to: "/dashboard/admin/proxies",
				},
				{
					label: "Settings",
					description: "Access, AI, defaults",
					icon: "i-lucide-settings",
					to: "/dashboard/admin/settings",
				},
			]
		: []),
]);
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="Overview" icon="i-lucide-layout-dashboard" />
		</template>

		<template #body>
			<DashboardPageBody>
				<div class="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">Hi, {{ user.display_name || user.username }}</h1>
						<p class="mt-1 text-slate-400">
							{{ instance?.name ?? "X-Ray" }} ·
							{{ instance?.search_access === "public" ? "open to everyone" : "private instance" }}
						</p>
					</div>
					<UButton to="/" label="Search" icon="i-lucide-search" color="primary" size="lg" />
				</div>

				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<NuxtLink v-for="action in quickActions" :key="action.to" :to="action.to">
						<UCard class="h-full border-slate-800 bg-slate-900/60 transition hover:border-primary/40">
							<div class="flex items-center gap-3">
								<div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
									<UIcon :name="action.icon" class="size-5 text-primary" />
								</div>
								<div>
									<p class="font-semibold">{{ action.label }}</p>
									<p class="text-sm text-slate-400">{{ action.description }}</p>
								</div>
							</div>
						</UCard>
					</NuxtLink>
				</div>

				<UCard v-if="isAdmin" class="border-slate-800 bg-slate-900/60">
					<template #header>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<UIcon name="i-lucide-activity" class="size-5 text-primary" />
								<h2 class="font-semibold">Engine health</h2>
							</div>
							<UButton to="/dashboard/admin/engines" label="Manage" size="sm" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" />
						</div>
					</template>

					<div v-if="loadingEngines" class="flex justify-center py-6">
						<UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-500" />
					</div>
					<div v-else class="space-y-4">
						<div class="flex flex-wrap gap-8">
							<div>
								<p class="text-3xl font-bold">{{ engineStats.enabled }}</p>
								<p class="text-sm text-slate-400">Enabled engines</p>
							</div>
							<div>
								<p class="text-3xl font-bold text-emerald-400">{{ engineStats.healthy }}</p>
								<p class="text-sm text-slate-400">Healthy</p>
							</div>
							<div>
								<p class="text-3xl font-bold" :class="engineStats.problems.length ? 'text-amber-400' : 'text-slate-500'">
									{{ engineStats.problems.length }}
								</p>
								<p class="text-sm text-slate-400">Need attention</p>
							</div>
						</div>
						<ul v-if="engineStats.problems.length" class="divide-y divide-slate-800 rounded-lg border border-slate-800">
							<li v-for="engine in engineStats.problems" :key="engine.id" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
								<span class="font-medium">{{ engine.name }}</span>
								<span class="truncate text-slate-400">
									{{ engine.load_error ?? engine.health.last_error }}
									<template v-if="engine.health.suspended_until">
										· suspended until {{ new Date(engine.health.suspended_until).toLocaleTimeString() }}
									</template>
								</span>
							</li>
						</ul>
						<p v-else class="text-sm text-slate-400">All engines answered their last requests.</p>
					</div>
				</UCard>
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
