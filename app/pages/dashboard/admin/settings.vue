<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

definePageMeta({ layout: "dashboard" });

const links = [
	[
		{ label: "Instance", icon: "i-lucide-server", to: "/dashboard/admin/settings", exact: true },
		{
			label: "Search defaults",
			icon: "i-lucide-sliders-horizontal",
			to: "/dashboard/admin/settings/search",
		},
		{ label: "AI", icon: "i-lucide-sparkles", to: "/dashboard/admin/settings/ai" },
	],
] satisfies NavigationMenuItem[][];
</script>

<template>
	<UDashboardPanel id="admin-settings" :ui="{ body: 'lg:py-10' }">
		<template #header>
			<DashboardPageHeader title="Settings" icon="i-lucide-settings" description="Instance-wide configuration" />

			<UDashboardToolbar>
				<!-- `-mx-1` aligns the menu with the sidebar collapse button. -->
				<UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
			</UDashboardToolbar>
		</template>

		<template #body>
			<div class="mx-auto flex w-full flex-col gap-6 lg:max-w-3xl">
				<NuxtPage />
			</div>
		</template>
	</UDashboardPanel>
</template>
