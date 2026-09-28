<script setup lang="ts">
/** Slim top bar used by the home, auth and error pages. */
withDefaults(defineProps<{ showLogo?: boolean }>(), { showLogo: true });
</script>

<template>
	<header class="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
		<NuxtLink v-if="showLogo" to="/" class="h-8" aria-label="X-Ray home">
			<ImgAppLogo class="h-8" />
		</NuxtLink>
		<span v-else />

		<div class="flex items-center gap-2">
			<slot name="right" />
			<LayoutAccountMenu />
		</div>
	</header>
</template>
