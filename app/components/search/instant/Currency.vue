<script setup lang="ts">
const props = defineProps<{ data: Record<string, any> }>();

const rates = computed(() => (props.data.rates ?? {}) as Record<string, number>);
const targets = computed(() => Object.keys(rates.value).sort());

const amount = ref<number>(props.data.amount);
const target = ref<string>(props.data.to);

const rate = computed(() => rates.value[target.value] ?? 0);
const result = computed(() => amount.value * rate.value);

function format(value: number, currency: string) {
	try {
		return value.toLocaleString("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 6 : 2,
		});
	} catch {
		return `${value.toFixed(2)} ${currency}`;
	}
}
</script>

<template>
	<div class="space-y-4">
		<div>
			<p class="text-sm text-slate-400">{{ format(amount, data.from) }} equals</p>
			<p class="mt-1 text-3xl font-semibold text-white sm:text-4xl">{{ format(result, target) }}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<UInputNumber v-model="amount" :min="0" :step-snapping="false" class="w-40" />
			<span class="rounded-md border border-slate-800 px-3 py-1.5 font-mono text-sm text-slate-300">{{ data.from }}</span>
			<UIcon name="i-lucide-arrow-right" class="text-slate-500" />
			<USelectMenu v-model="target" :items="targets" class="w-32" />
		</div>
		<p class="text-xs text-slate-500">
			1 {{ data.from }} = {{ rate.toLocaleString("en-US", { maximumFractionDigits: 6 }) }} {{ target }} ·
			reference rate of {{ data.date }}
		</p>
	</div>
</template>
