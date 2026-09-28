<script setup lang="ts">
defineProps<{ engines: string[] }>();
</script>

<template>
	<span class="inline-flex flex-wrap items-center gap-1">
		<span
			v-for="engine in engines"
			:key="engine"
			class="rounded border border-slate-700/80 px-1 py-px font-mono text-[10px] leading-4 tracking-wide text-slate-400 uppercase"
		>
			{{ engine }}
		</span>
	</span>
</template>
