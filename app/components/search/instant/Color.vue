<script setup lang="ts">
const props = defineProps<{ data: Record<string, any> }>();

const rows = computed(() => [
	{ label: "HEX", value: props.data.hex },
	{ label: "RGB", value: props.data.rgb },
	{ label: "HSL", value: props.data.hsl },
	{ label: "CMYK", value: props.data.cmyk },
]);
</script>

<template>
	<div class="flex flex-col gap-5 sm:flex-row">
		<div
			class="h-28 w-full shrink-0 rounded-xl border border-slate-700 sm:h-auto sm:w-32"
			:style="{ backgroundColor: data.hex }"
			role="img"
			:aria-label="`Color ${data.hex}`"
		/>
		<dl class="flex-1 divide-y divide-slate-800">
			<div v-for="row in rows" :key="row.label" class="flex items-center justify-between gap-3 py-1.5">
				<dt class="w-14 text-xs font-medium text-slate-500">{{ row.label }}</dt>
				<dd class="flex-1 font-mono text-sm text-slate-200">{{ row.value }}</dd>
				<UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" :aria-label="`Copy ${row.label}`" @click="copyText(row.value)" />
			</div>
		</dl>
	</div>
</template>
