<script setup lang="ts">
/**
 * Public landing page — hero, feature grid, how-it-works, CTA (LeiOS / Delivr website pattern).
 * Replace the copy and data arrays; delete sections you don't need. Apps without a public
 * landing page can delete this file and point `/` at the app instead (see auth.global.ts).
 */
import { useUserInfoStore } from "~/composables/stores/useUserStore";

usePageSeo({
	title: "ProjectName — One-line pitch for your project",
	description: "A short description of what ProjectName does and who it is for.",
});

const user = await useUserInfoStore().use();
const primaryCta = computed(() =>
	user.value
		? { label: "Open Dashboard", to: "/dashboard", icon: "i-lucide-layout-dashboard" }
		: { label: "Get Started", to: "/auth/login", icon: "i-lucide-log-in" },
);

const stats = [
	{ value: "100%", label: "Open Source" },
	{ value: "Self-Hosted", label: "Your data" },
	{ value: "REST", label: "Typed API" },
	{ value: "24/7", label: "Always on" },
];

const features = [
	{
		icon: "i-lucide-zap",
		title: "Fast by default",
		description: "Server-side rendering, a typed API client, and caching where it counts.",
	},
	{
		icon: "i-lucide-shield-check",
		title: "Secure",
		description: "Hashed session tokens, scoped API keys, and role-based admin areas.",
	},
	{
		icon: "i-lucide-key",
		title: "API first",
		description: "Everything the UI does is available over the documented REST API.",
	},
	{
		icon: "i-lucide-users",
		title: "Team ready",
		description: "Admins manage users and roles from a built-in dashboard.",
	},
	{
		icon: "i-lucide-server",
		title: "Self-hostable",
		description: "One container, one SQLite file. Run it wherever you like.",
	},
	{
		icon: "i-lucide-code-2",
		title: "Open source",
		description: "Read the code, open issues, and contribute on GitHub.",
	},
];

const steps = [
	{
		icon: "i-lucide-user-plus",
		title: "Create an account",
		description: "Sign in with the account an admin created for you.",
	},
	{
		icon: "i-lucide-settings",
		title: "Set things up",
		description: "Complete your profile and create an API key.",
	},
	{
		icon: "i-lucide-rocket",
		title: "Ship",
		description: "Use the dashboard or the API to get work done.",
	},
];
</script>

<template>
	<div>
		<!-- Hero -->
		<section
			class="relative flex min-h-[90vh] items-center overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.15),transparent)]"
		>
			<div class="pointer-events-none absolute inset-0 overflow-hidden">
				<div class="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl"></div>
				<div class="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-primary-400/5 blur-3xl"></div>
			</div>

			<UContainer class="relative z-10">
				<div class="mx-auto max-w-4xl text-center">
					<UBadge color="primary" variant="soft" size="xl" class="mb-6 inline-flex items-center gap-1">
						<UIcon name="i-lucide-sparkles" />
						A short tagline for ProjectName
					</UBadge>

					<h1 class="mb-6 text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl md:text-7xl">
						Your product,
						<span class="bg-linear-to-tr from-primary-400 to-primary-200 bg-clip-text text-transparent">
							refined
						</span>
					</h1>

					<p class="mx-auto mb-8 max-w-2xl text-lg leading-[1.6] text-slate-400 sm:text-xl lg:text-2xl">
						Explain in one or two sentences what ProjectName does, who it is for, and why it is
						better than the alternatives.
					</p>

					<div class="mb-12 flex flex-col justify-center gap-4 sm:flex-row">
						<UButton :to="primaryCta.to" size="xl" color="primary" class="px-8">
							<template #leading>
								<UIcon :name="primaryCta.icon" />
							</template>
							{{ primaryCta.label }}
						</UButton>
						<UButton to="#features" size="xl" color="neutral" variant="outline" class="px-8">
							<template #leading>
								<UIcon name="i-lucide-info" />
							</template>
							Learn more
						</UButton>
					</div>

					<div class="mx-auto grid w-max max-w-xl grid-cols-2 gap-8 text-center md:max-w-3xl md:grid-cols-4">
						<div v-for="stat in stats" :key="stat.label" class="space-y-1">
							<div class="text-2xl font-bold text-primary-400 md:text-3xl">{{ stat.value }}</div>
							<div class="text-sm text-slate-500">{{ stat.label }}</div>
						</div>
					</div>
				</div>
			</UContainer>

			<div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-slate-500">
				<UIcon name="i-lucide-chevron-down" class="text-xl" />
			</div>
		</section>

		<!-- Features -->
		<section id="features" class="bg-slate-950/50 py-24">
			<UContainer>
				<header class="mb-12 text-center">
					<UBadge color="primary" variant="soft" size="xl" class="mb-3">Features</UBadge>
					<h2 class="mb-3 text-3xl font-bold sm:text-4xl lg:text-5xl">Why ProjectName?</h2>
					<p class="mx-auto max-w-3xl text-lg text-slate-400">
						The three to six things that make ProjectName worth using.
					</p>
				</header>

				<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
					<UCard
						v-for="feature in features"
						:key="feature.title"
						class="border-slate-800 bg-slate-900/50 transition duration-300 hover:-translate-y-1 hover:border-primary-400/50"
					>
						<div class="space-y-3 p-2">
							<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-500/10">
								<UIcon :name="feature.icon" class="text-xl text-primary-400" />
							</div>
							<h3 class="text-lg font-semibold">{{ feature.title }}</h3>
							<p class="leading-relaxed text-slate-400">{{ feature.description }}</p>
						</div>
					</UCard>
				</div>
			</UContainer>
		</section>

		<!-- How it works -->
		<section class="relative py-24">
			<div
				class="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-primary-500/5 to-transparent"
			></div>
			<UContainer class="relative z-10">
				<header class="mb-12 text-center">
					<UBadge color="primary" variant="soft" size="xl" class="mb-3">How it works</UBadge>
					<h2 class="mb-3 text-3xl font-bold sm:text-4xl lg:text-5xl">Up and running in minutes</h2>
				</header>

				<div class="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
					<UCard
						v-for="(step, index) in steps"
						:key="step.title"
						class="border-slate-800 bg-slate-900/80"
					>
						<div class="space-y-3 p-2">
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-500/10">
									<UIcon :name="step.icon" class="text-xl text-primary-400" />
								</div>
								<span class="text-sm font-semibold text-slate-500">Step {{ index + 1 }}</span>
							</div>
							<h3 class="text-lg font-semibold">{{ step.title }}</h3>
							<p class="leading-relaxed text-slate-400">{{ step.description }}</p>
						</div>
					</UCard>
				</div>
			</UContainer>
		</section>

		<!-- CTA -->
		<section class="relative overflow-hidden bg-slate-950/50 py-28">
			<div
				class="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-primary-500/5 to-transparent"
			></div>
			<UContainer class="relative z-10">
				<div class="mx-auto max-w-3xl text-center">
					<h2 class="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
						Ready to try
						<span class="bg-linear-to-tr from-primary-400 to-primary-200 bg-clip-text text-transparent"
							>ProjectName</span
						>?
					</h2>
					<p class="mx-auto mb-8 max-w-2xl text-lg text-slate-400">
						One closing sentence that tells visitors what to do next.
					</p>
					<div class="flex flex-col justify-center gap-4 sm:flex-row">
						<UButton :to="primaryCta.to" size="xl" color="primary" class="px-8">
							<template #leading>
								<UIcon :name="primaryCta.icon" />
							</template>
							{{ primaryCta.label }}
						</UButton>
						<UButton
							to="https://github.com/LeiCraftMC"
							target="_blank"
							size="xl"
							color="neutral"
							variant="outline"
							class="px-8"
						>
							<template #leading>
								<UIcon name="i-lucide-github" />
							</template>
							View on GitHub
						</UButton>
					</div>
				</div>
			</UContainer>
		</section>
	</div>
</template>
