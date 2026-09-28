<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{
	error: NuxtError;
}>();
</script>

<template>
	<UApp>
		<div class="main-bg-color flex min-h-dvh flex-col text-slate-100">
			<LayoutHeader />

			<UMain class="flex-1">
				<UError :error="error" :clear="{ label: 'Back to search', to: '/' }" />
			</UMain>

			<LayoutFooter />
		</div>
	</UApp>
</template>
