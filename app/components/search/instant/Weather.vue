<script setup lang="ts">
const props = defineProps<{ data: Record<string, any> }>();

const place = computed(() =>
	[props.data.location?.name, props.data.location?.region, props.data.location?.country]
		.filter(Boolean)
		.join(", "),
);

function weekday(date: string, index: number) {
	if (index === 0) return "Today";
	return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

const round = (value: number | null | undefined) =>
	typeof value === "number" ? Math.round(value) : "–";
</script>

<template>
	<div class="space-y-5">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-4">
				<UIcon :name="data.current.icon" class="size-14 text-primary" />
				<div>
					<p class="text-5xl font-semibold text-white">
						{{ round(data.current.temperature) }}<span class="text-2xl text-slate-400">{{ data.units.temperature }}</span>
					</p>
					<p class="text-slate-300">{{ data.current.description }}</p>
				</div>
			</div>
			<dl class="grid grid-cols-3 gap-x-5 gap-y-1 text-sm sm:text-right">
				<dt class="text-slate-500">Feels like</dt>
				<dt class="text-slate-500">Humidity</dt>
				<dt class="text-slate-500">Wind</dt>
				<dd class="text-slate-200">{{ round(data.current.apparent_temperature) }}{{ data.units.temperature }}</dd>
				<dd class="text-slate-200">{{ round(data.current.humidity) }}%</dd>
				<dd class="text-slate-200">{{ round(data.current.wind_speed) }} {{ data.units.wind_speed }}</dd>
			</dl>
		</div>

		<div class="grid grid-cols-5 gap-2">
			<div
				v-for="(day, index) in data.daily"
				:key="day.date"
				class="flex flex-col items-center gap-1 rounded-xl border border-slate-800/80 bg-slate-900/40 px-1 py-2.5 text-center"
			>
				<span class="text-xs font-medium text-slate-400">{{ weekday(day.date, Number(index)) }}</span>
				<UIcon :name="day.icon" class="size-6 text-slate-200" :title="day.description" />
				<span class="text-sm text-white">{{ round(day.max) }}°</span>
				<span class="text-xs text-slate-500">{{ round(day.min) }}°</span>
				<span v-if="day.precipitation_probability" class="text-[11px] text-sky-400">
					{{ day.precipitation_probability }}%
				</span>
			</div>
		</div>

		<p class="text-xs text-slate-500">{{ place }}</p>
	</div>
</template>
