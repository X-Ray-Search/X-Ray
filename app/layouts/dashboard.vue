<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const user = await useUserInfoStore().use();
const isAdmin = computed(() => user.value?.role === "admin");

const mainItems: NavigationMenuItem[] = [
	{ label: "Back to search", icon: "i-lucide-search", to: "/" },
	{ label: "Overview", icon: "i-lucide-layout-dashboard", to: "/dashboard", exact: true },
];

const searchItems: NavigationMenuItem[] = [
	{ label: "Search", type: "label" },
	{ label: "Preferences", icon: "i-lucide-sliders-horizontal", to: "/dashboard/preferences" },
	{ label: "My bangs", icon: "i-lucide-zap", to: "/dashboard/bangs" },
	{ label: "API keys", icon: "i-lucide-key", to: "/dashboard/apikeys" },
];

const accountItems: NavigationMenuItem[] = [
	{ label: "Account", type: "label" },
	{ label: "Profile", icon: "i-lucide-user", to: "/dashboard/settings", exact: true },
	{ label: "Security", icon: "i-lucide-shield", to: "/dashboard/settings/security" },
];

const adminItems: NavigationMenuItem[] = [
	{ label: "Administration", type: "label" },
	{ label: "Engines", icon: "i-lucide-radar", to: "/dashboard/admin/engines" },
	{ label: "Proxies", icon: "i-lucide-route", to: "/dashboard/admin/proxies" },
	{ label: "Instance bangs", icon: "i-lucide-zap", to: "/dashboard/admin/bangs" },
	{ label: "Settings", icon: "i-lucide-settings", to: "/dashboard/admin/settings" },
	{ label: "Users", icon: "i-lucide-users", to: "/dashboard/admin/users" },
];
</script>

<template>
	<NuxtLoadingIndicator color="var(--ui-primary)" position="top" :height="2" />

	<UDashboardGroup class="main-bg-color text-slate-100">
		<UDashboardSidebar
			collapsible
			resizable
			:ui="{
				header: 'main-bg-color',
				body: 'main-bg-color',
				content: 'main-bg-color',
				footer: 'border-t border-default main-bg-color',
			}"
			:min-size="16"
			:default-size="18"
			:max-size="28"
		>
			<template #header="{ collapsed }">
				<NuxtLink to="/" :class="`${!collapsed ? 'ms-2.5' : ''} flex h-7 items-center gap-1.5`">
					<ImgAppLogo v-if="!collapsed" class="h-7" />
					<ImgAppIcon v-else class="h-8 w-8" />
				</NuxtLink>
			</template>

			<template #default="{ collapsed }">
				<UNavigationMenu :collapsed="collapsed" :items="mainItems" orientation="vertical" />
				<UNavigationMenu :collapsed="collapsed" :items="searchItems" orientation="vertical" />
				<UNavigationMenu :collapsed="collapsed" :items="accountItems" orientation="vertical" />
				<UNavigationMenu v-if="isAdmin" :collapsed="collapsed" :items="adminItems" orientation="vertical" />
			</template>

			<template #footer="{ collapsed }">
				<DashboardUserMenu :collapsed="collapsed" />
			</template>
		</UDashboardSidebar>

		<slot />
	</UDashboardGroup>
</template>
