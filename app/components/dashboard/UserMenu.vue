<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

defineProps<{
	collapsed?: boolean;
}>();

const toast = useToast();
const userInfo = await useUserInfoStore().use();
const { signOut } = useSession();

const name = computed(
	() => userInfo.value?.display_name || userInfo.value?.username || "Unknown user",
);

async function logout() {
	const ok = await signOut();
	toast.add({
		title: "Signed out",
		description: ok ? undefined : "Your local session was cleared, but the server did not respond.",
		icon: "i-lucide-log-out",
		color: ok ? "success" : "warning",
	});
	await navigateTo("/auth/login");
}

const items = computed<DropdownMenuItem[][]>(() => [
	[
		{
			type: "label",
			label: name.value,
			description: userInfo.value ? `@${userInfo.value.username}` : undefined,
		},
	],
	[
		{ label: "Search", icon: "i-lucide-search", to: "/" },
		{ label: "Preferences", icon: "i-lucide-sliders-horizontal", to: "/dashboard/preferences" },
	],
	[{ label: "Sign out", icon: "i-lucide-log-out", onSelect: logout }],
]);
</script>

<template>
	<UDropdownMenu
		:items="items"
		:content="{ align: 'center', collisionPadding: 12 }"
		:ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
	>
		<UButton
			:label="collapsed ? undefined : name"
			:trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
			color="neutral"
			variant="ghost"
			block
			:square="collapsed"
			class="data-[state=open]:bg-elevated/50 hover:bg-elevated/50"
			:ui="{ trailingIcon: 'text-dimmed' }"
		>
			<template #leading>
				<Gravatar :email="userInfo?.email" :alt="name" size="xs" />
			</template>
		</UButton>
	</UDropdownMenu>
</template>
