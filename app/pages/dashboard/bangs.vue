<script setup lang="ts">
definePageMeta({ layout: "dashboard" });
useSeoMeta({ title: "My bangs | X-Ray" });

const examples = [
	{ bang: "!w", target: "Wikipedia" },
	{ bang: "!yt", target: "YouTube" },
	{ bang: "!gh", target: "GitHub" },
	{ bang: "!i", target: "X-Ray images" },
	{ bang: "!", target: "First result" },
];
</script>

<template>
	<UDashboardPanel>
		<template #header>
			<DashboardPageHeader title="My bangs" icon="i-lucide-zap" description="Personal search shortcuts" />
		</template>

		<template #body>
			<DashboardPageBody>
				<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
					<p class="text-sm text-slate-300">
						Type a bang anywhere in your query to go straight to a site — <span class="font-mono text-primary">!w black holes</span>
						searches Wikipedia. Your own bangs take precedence over instance and DuckDuckGo bangs, so you can also redefine
						existing ones.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<span
							v-for="example in examples"
							:key="example.bang"
							class="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-400"
						>
							<span class="font-mono text-primary">{{ example.bang }}</span> {{ example.target }}
						</span>
					</div>
				</div>

				<DashboardBangsManager scope="personal" />
			</DashboardPageBody>
		</template>
	</UDashboardPanel>
</template>
