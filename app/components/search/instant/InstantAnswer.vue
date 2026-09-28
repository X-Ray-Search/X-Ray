<script setup lang="ts">
/** Renders one instant answer: a shared card with a type-specific widget inside. */
import type { InstantAnswer } from "~/utils/types";

const props = defineProps<{ answer: InstantAnswer }>();

const ICONS: Record<string, string> = {
	calculator: "i-lucide-calculator",
	unit_conversion: "i-lucide-ruler",
	currency: "i-lucide-banknote",
	time: "i-lucide-clock",
	weather: "i-lucide-cloud-sun",
	timer: "i-lucide-timer",
	random: "i-lucide-dices",
	uuid: "i-lucide-fingerprint",
	password: "i-lucide-key-round",
	hash: "i-lucide-hash",
	encoding: "i-lucide-binary",
	color: "i-lucide-palette",
	ip: "i-lucide-network",
	timestamp: "i-lucide-clock-3",
	lorem_ipsum: "i-lucide-text",
	definition: "i-lucide-book-open",
};

const icon = computed(() => ICONS[props.answer.type] ?? "i-lucide-sparkles");

const WIDGETS = new Set([
	"calculator",
	"unit_conversion",
	"currency",
	"time",
	"weather",
	"timer",
	"definition",
	"color",
	"password",
	"timestamp",
]);
const hasWidget = computed(() => WIDGETS.has(props.answer.type));
</script>

<template>
	<section
		class="overflow-hidden rounded-2xl border border-slate-800 bg-linear-to-b from-slate-900/70 to-slate-950/40"
		:aria-label="answer.title"
	>
		<header class="flex items-center gap-2 border-b border-slate-800/80 px-5 py-2.5 text-sm">
			<UIcon :name="icon" class="size-4 text-primary" />
			<span class="font-medium text-slate-300">{{ answer.title }}</span>
			<a
				v-if="answer.source"
				:href="answer.source.url ?? undefined"
				target="_blank"
				rel="noopener noreferrer"
				class="ml-auto truncate text-xs text-slate-500 hover:text-slate-300"
			>
				{{ answer.source.name }}
			</a>
		</header>

		<div class="p-5">
			<SearchInstantCalculator v-if="answer.type === 'calculator'" :data="answer.data" />
			<SearchInstantUnitConversion v-else-if="answer.type === 'unit_conversion'" :data="answer.data" />
			<SearchInstantCurrency v-else-if="answer.type === 'currency'" :data="answer.data" />
			<SearchInstantClock v-else-if="answer.type === 'time'" :data="answer.data" />
			<SearchInstantWeather v-else-if="answer.type === 'weather'" :data="answer.data" />
			<SearchInstantTimer v-else-if="answer.type === 'timer'" :data="answer.data" />
			<SearchInstantDefinition v-else-if="answer.type === 'definition'" :data="answer.data" />
			<SearchInstantColor v-else-if="answer.type === 'color'" :data="answer.data" />
			<SearchInstantPassword v-else-if="answer.type === 'password'" :data="answer.data" />
			<SearchInstantTimestamp v-else-if="answer.type === 'timestamp'" :data="answer.data" />
			<SearchInstantText v-else-if="!hasWidget" :answer="answer" />
		</div>
	</section>
</template>
