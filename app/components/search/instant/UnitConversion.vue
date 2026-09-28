<script setup lang="ts">
/** Live unit converter — the server sends every unit of the dimension with its factors. */
interface Unit {
	id: string;
	label: string;
	factor: number;
	offset: number;
}

const props = defineProps<{ data: Record<string, any> }>();

const units = computed(() => (props.data.units ?? []) as Unit[]);
const unitItems = computed(() => units.value.map((u) => ({ label: u.label, value: u.id })));

const fromUnit = ref<string>(props.data.from.unit);
const toUnit = ref<string>(props.data.to.unit);
const fromValue = ref<number>(props.data.from.value);
const toValue = ref<number>(props.data.to.value);

function convert(value: number, from: string, to: string) {
	const a = units.value.find((u) => u.id === from);
	const b = units.value.find((u) => u.id === to);
	if (!a || !b || !Number.isFinite(value)) return Number.NaN;
	return ((value + a.offset) * a.factor) / b.factor - b.offset;
}

function round(value: number) {
	return Number.isFinite(value) ? Number.parseFloat(value.toPrecision(10)) : 0;
}

function onFromChange() {
	toValue.value = round(convert(fromValue.value, fromUnit.value, toUnit.value));
}

function onToChange() {
	fromValue.value = round(convert(toValue.value, toUnit.value, fromUnit.value));
}

function swap() {
	[fromUnit.value, toUnit.value] = [toUnit.value, fromUnit.value];
	onFromChange();
}

toValue.value = round(toValue.value);
</script>

<template>
	<div class="space-y-3">
		<div class="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
			<div class="flex gap-2">
				<UInputNumber
					v-model="fromValue"
					:step-snapping="false"
					:format-options="{ maximumFractionDigits: 10 }"
					class="min-w-0 flex-1"
					size="lg"
					@update:model-value="onFromChange"
				/>
				<USelect v-model="fromUnit" :items="unitItems" class="w-40" size="lg" @update:model-value="onFromChange" />
			</div>
			<UButton
				icon="i-lucide-arrow-left-right"
				color="neutral"
				variant="ghost"
				class="justify-self-center"
				aria-label="Swap units"
				@click="swap"
			/>
			<div class="flex gap-2">
				<UInputNumber
					v-model="toValue"
					:step-snapping="false"
					:format-options="{ maximumFractionDigits: 10 }"
					class="min-w-0 flex-1"
					size="lg"
					@update:model-value="onToChange"
				/>
				<USelect v-model="toUnit" :items="unitItems" class="w-40" size="lg" @update:model-value="onFromChange" />
			</div>
		</div>
		<p class="text-xs text-slate-500 capitalize">{{ data.dimension }}</p>
	</div>
</template>
