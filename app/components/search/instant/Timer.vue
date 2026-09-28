<script setup lang="ts">
/** Countdown timer or stopwatch that runs in the browser. */
const props = defineProps<{ data: Record<string, any> }>();

const stopwatch = props.data.mode === "stopwatch";
const total = ref<number>(props.data.seconds ?? 0);
const elapsedMs = ref(0);
const running = ref(false);
const finished = ref(false);
let startedAt = 0;
let base = 0;
let frame: ReturnType<typeof setInterval> | undefined;

const displayMs = computed(() =>
	stopwatch ? elapsedMs.value : Math.max(0, total.value * 1000 - elapsedMs.value),
);

const display = computed(() => {
	const ms = displayMs.value;
	const hours = Math.floor(ms / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	const pad = (n: number) => String(n).padStart(2, "0");
	const main = hours
		? `${hours}:${pad(minutes)}:${pad(seconds)}`
		: `${pad(minutes)}:${pad(seconds)}`;
	return stopwatch ? `${main}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}` : main;
});

const progress = computed(() =>
	stopwatch || !total.value ? 0 : Math.min(100, (elapsedMs.value / (total.value * 1000)) * 100),
);

function beep() {
	try {
		const ctx = new AudioContext();
		for (let i = 0; i < 3; i++) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = 880;
			gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.35);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.3);
			osc.connect(gain).connect(ctx.destination);
			osc.start(ctx.currentTime + i * 0.35);
			osc.stop(ctx.currentTime + i * 0.35 + 0.3);
		}
	} catch {
		// Audio may be blocked — the visual state still changes.
	}
}

function tick() {
	elapsedMs.value = base + (performance.now() - startedAt);
	if (!stopwatch && elapsedMs.value >= total.value * 1000) {
		pause();
		elapsedMs.value = total.value * 1000;
		finished.value = true;
		beep();
	}
}

function start() {
	if (finished.value) reset();
	startedAt = performance.now();
	running.value = true;
	frame = setInterval(tick, stopwatch ? 31 : 200);
}

function pause() {
	clearInterval(frame);
	base = elapsedMs.value;
	running.value = false;
}

function reset() {
	clearInterval(frame);
	running.value = false;
	finished.value = false;
	elapsedMs.value = 0;
	base = 0;
}

function adjust(deltaSeconds: number) {
	total.value = Math.max(10, total.value + deltaSeconds);
	finished.value = false;
}

onBeforeUnmount(() => clearInterval(frame));
</script>

<template>
	<div class="space-y-4">
		<div class="flex items-center gap-4">
			<p
				class="font-mono text-5xl font-semibold tabular-nums transition-colors"
				:class="finished ? 'animate-pulse text-primary' : 'text-white'"
			>
				{{ display }}
			</p>
			<div v-if="!stopwatch && !running" class="flex flex-col gap-1">
				<UButton size="xs" color="neutral" variant="soft" label="+1 min" @click="adjust(60)" />
				<UButton size="xs" color="neutral" variant="soft" label="−1 min" @click="adjust(-60)" />
			</div>
		</div>
		<UProgress v-if="!stopwatch" :model-value="progress" size="xs" />
		<div class="flex gap-2">
			<UButton
				v-if="!running"
				:label="finished ? 'Restart' : elapsedMs ? 'Resume' : 'Start'"
				icon="i-lucide-play"
				color="primary"
				@click="start"
			/>
			<UButton v-else label="Pause" icon="i-lucide-pause" color="neutral" variant="soft" @click="pause" />
			<UButton label="Reset" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" :disabled="!elapsedMs" @click="reset" />
		</div>
	</div>
</template>
