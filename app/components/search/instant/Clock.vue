<script setup lang="ts">
/** Live clock. `offset_minutes: null` means "the visitor's local time". */
const props = defineProps<{ data: Record<string, any> }>();

// Replaced by the browser clock on mount.
const now = ref<number>(props.data.server_time ?? Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
// Server and browser time zones differ, so the time is only rendered after mount.
const mounted = ref(false);

onMounted(() => {
	mounted.value = true;
	now.value = Date.now();
	timer = setInterval(() => {
		now.value = Date.now();
	}, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const zone = computed<string | undefined>(() => {
	if (props.data.timezone) return props.data.timezone;
	if (props.data.offset_minutes === null || props.data.offset_minutes === undefined)
		return undefined;
	return "UTC";
});

/** For fixed UTC offsets we shift the timestamp and format it as UTC. */
const shifted = computed(() =>
	props.data.timezone || props.data.offset_minutes == null
		? now.value
		: now.value + props.data.offset_minutes * 60_000,
);

const time = computed(() =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone: zone.value,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(shifted.value),
);
const date = computed(() =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: zone.value,
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(shifted.value),
);

const offsetLabel = computed(() => {
	const minutes = props.data.offset_minutes;
	if (minutes === null || minutes === undefined)
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	const sign = minutes >= 0 ? "+" : "-";
	const abs = Math.abs(minutes);
	return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
});
</script>

<template>
	<div v-if="!mounted" class="space-y-2">
		<USkeleton class="h-12 w-52" />
		<USkeleton class="h-5 w-64" />
	</div>
	<div v-else>
		<p class="font-mono text-4xl font-semibold text-white tabular-nums sm:text-5xl">{{ time }}</p>
		<p class="mt-2 text-slate-300">{{ date }}</p>
		<p class="mt-1 text-sm text-slate-500">
			<span v-if="data.location">{{ data.location }} · </span>{{ data.timezone ?? offsetLabel }}
			<span v-if="data.timezone"> ({{ offsetLabel }})</span>
		</p>
	</div>
</template>
