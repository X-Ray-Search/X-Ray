<script setup lang="ts">
defineProps<{ data: Record<string, any> }>();
</script>

<template>
	<div class="flex items-end justify-between gap-4">
		<div class="min-w-0">
			<p class="truncate font-mono text-sm text-slate-400">{{ data.expression }} =</p>
			<p class="mt-1 font-mono text-3xl font-semibold break-all text-white sm:text-4xl">{{ data.result }}</p>
		</div>
		<UButton
			icon="i-lucide-copy"
			color="neutral"
			variant="ghost"
			aria-label="Copy result"
			@click="copyText(String(data.result))"
		/>
	</div>
</template>
