<script setup lang="ts">
import type { FooterColumn } from "@nuxt/ui";

// Replace the links and texts below with your project's.
const socialLinks = [
	{ icon: "i-lucide-github", to: "https://github.com/LeiCraftMC", label: "GitHub" },
	{ icon: "i-lucide-gitlab", to: "https://git.leicraftmc.de/LeiCraftMC", label: "GitLab" },
	{
		icon: "i-lucide-message-circle",
		to: "https://discord.com/invite/3cdazADhtv",
		label: "Discord",
	},
];

const footerColumns: FooterColumn[] = [
	{
		label: "Product",
		children: [
			{ label: "Home", to: "/" },
			{ label: "Dashboard", to: "/dashboard" },
		],
	},
	{
		label: "Legal",
		children: [
			{ label: "Impressum", to: "https://legal.leicraftmc.de/impressum/", target: "_blank" },
			{ label: "Datenschutz", to: "https://legal.leicraftmc.de/datenschutz/", target: "_blank" },
		],
	},
];

const currentYear = new Date().getFullYear();
</script>

<template>
	<USeparator />
	<UFooter
		:ui="{
			root: 'py-12',
			container: 'py-0 lg:py-0 lg:gap-x-0 gap-x-0 lg:block',
			bottom: 'p-0 lg:p-0 mt-8',
		}"
	>
		<UFooterColumns
			:columns="footerColumns"
			:ui="{
				root: 'grid gap-8 sm:grid-cols-2 xl:grid-cols-2 w-full',
				center: 'xl:col-span-1 grid',
				label: 'text-slate-100 font-semibold text-base',
				link: 'text-slate-400 hover:text-primary text-sm sm:text-base inline-block py-1 transition-colors',
				left: 'mb-0',
			}"
		>
			<template #left>
				<div class="space-y-4">
					<span
						class="inline-block bg-linear-to-tr from-primary-400 to-primary-200 bg-clip-text text-2xl font-bold text-transparent"
					>
						ProjectName
					</span>
					<p class="text-base leading-relaxed text-slate-300/80 md:max-w-3xl">
						A short description of what ProjectName does and who it is for.
					</p>
					<div class="flex gap-2 pt-2">
						<UButton
							v-for="social in socialLinks"
							:key="social.label"
							:to="social.to"
							target="_blank"
							:icon="social.icon"
							color="neutral"
							variant="ghost"
							size="lg"
							:aria-label="social.label"
							class="transition-transform hover:scale-110 hover:text-primary"
						/>
					</div>
				</div>
			</template>
		</UFooterColumns>

		<template #bottom>
			<UContainer>
				<div
					class="flex flex-col items-center border-t border-slate-800 pt-8 text-center md:flex-row md:justify-between md:text-left"
				>
					<p class="text-xs text-slate-500 sm:text-sm">
						&copy; {{ currentYear }} LeiCraft_MC. All rights reserved.
					</p>
					<p class="text-xs text-slate-500 sm:text-sm">Built with ❤️ for the community</p>
				</div>
			</UContainer>
		</template>
	</UFooter>
</template>
