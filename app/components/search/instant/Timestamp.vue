<script setup lang="ts">
const props = defineProps<{ data: Record<string, any> }>();

const seconds = ref<number>(props.data.timestamp);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
	if (!props.data.live) return;
	seconds.value = Math.floor(Date.now() / 1000);
	timer = setInterval(() => {
		seconds.value = Math.floor(Date.now() / 1000);
	}, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const iso = computed(() => new Date(seconds.value * 1000).toISOString());
</script>

<template>
	<div class="space-y-3">
		<div class="flex items-center gap-2">
			<p class="font-mono text-4xl font-semibold text-white tabular-nums">{{ seconds }}</p>
			<UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy timestamp" @click="copyText(String(seconds))" />
		</div>
		<dl class="grid gap-1 text-sm sm:grid-cols-[6rem_1fr]">
			<dt class="text-slate-500">ISO 8601</dt>
			<dd class="font-mono text-slate-200">{{ iso }}</dd>
			<dt class="text-slate-500">Milliseconds</dt>
			<dd class="font-mono text-slate-200">{{ seconds * 1000 }}</dd>
		</dl>
	</div>
</template>
