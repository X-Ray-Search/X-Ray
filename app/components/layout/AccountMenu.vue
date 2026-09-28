<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const route = useRoute();
const toast = useToast();
const user = await useUserInfoStore().use();
const { signOut } = useSession();

const loginRoute = computed(() =>
	route.path.startsWith("/auth")
		? "/auth/login"
		: `/auth/login?url=${encodeURIComponent(route.fullPath)}`,
);

async function logout() {
	const ok = await signOut();
	toast.add({
		title: "Signed out",
		description: ok ? undefined : "Your local session was cleared, but the server did not respond.",
		icon: "i-lucide-log-out",
		color: ok ? "success" : "warning",
	});
	await navigateTo("/");
}

const items = computed<DropdownMenuItem[][]>(() => {
	const u = user.value;
	if (!u) return [];
	return [
		[
			{
				type: "label",
				label: u.display_name || u.username,
				description: `@${u.username}`,
			} as DropdownMenuItem,
		],
		[
			{
				label: "Search preferences",
				icon: "i-lucide-sliders-horizontal",
				to: "/dashboard/preferences",
			},
			{ label: "My bangs", icon: "i-lucide-zap", to: "/dashboard/bangs" },
			{ label: "API keys", icon: "i-lucide-key", to: "/dashboard/apikeys" },
			{ label: "Account", icon: "i-lucide-user", to: "/dashboard/settings" },
		],
		...(u.role === "admin"
			? [[{ label: "Administration", icon: "i-lucide-shield", to: "/dashboard/admin/engines" }]]
			: []),
		[{ label: "Sign out", icon: "i-lucide-log-out", onSelect: logout }],
	];
});
</script>

<template>
	<UDropdownMenu
		v-if="user"
		:items="items"
		:content="{ align: 'end', collisionPadding: 12 }"
		:ui="{ content: 'w-60' }"
	>
		<UButton color="neutral" variant="ghost" class="rounded-full p-0.5" aria-label="Account menu">
			<Gravatar :email="user.email" :alt="user.display_name || user.username" size="md" />
		</UButton>
	</UDropdownMenu>

	<UButton v-else :to="loginRoute" color="primary" variant="soft" icon="i-lucide-log-in" label="Sign in" />
</template>
