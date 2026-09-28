<script setup lang="ts">
import { useInstanceStore } from "~/composables/stores/useInstanceStore";

const instance = await useInstanceStore().use();
</script>

<template>
	<footer class="border-t border-slate-800/70 px-4 py-4 text-xs text-slate-500 sm:px-6">
		<div class="flex flex-col items-center justify-between gap-2 sm:flex-row">
			<p class="font-mono">
				{{ instance?.name ?? "X-Ray" }}
				<span v-if="instance" class="text-slate-600">· v{{ instance.version }}</span>
			</p>
			<nav class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<NuxtLink to="/api/docs/v1" external target="_blank" class="hover:text-slate-300">API</NuxtLink>
				<NuxtLink to="/dashboard/preferences" class="hover:text-slate-300">Preferences</NuxtLink>
				<NuxtLink
					to="https://git.leicraftmc.de/X-Ray-Search/X-Ray"
					target="_blank"
					class="hover:text-slate-300"
				>
					Source
				</NuxtLink>
			</nav>
		</div>
	</footer>
</template>
