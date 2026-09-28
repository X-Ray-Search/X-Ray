<script setup lang="ts">
import type { EngineStatus } from "~/utils/types";

defineProps<{ count: number; timeMs: number; engines: EngineStatus[]; cached: boolean }>();

const STATUS_COLORS: Record<EngineStatus["status"], string> = {
	ok: "border-slate-700 text-slate-300",
	error: "border-red-900/70 text-red-400",
	timeout: "border-amber-900/70 text-amber-400",
	blocked: "border-red-900/70 text-red-400",
	suspended: "border-slate-800 text-slate-600 line-through",
};

function describe(engine: EngineStatus) {
	if (engine.status === "ok") return `${engine.results} results in ${engine.time_ms} ms`;
	return `${engine.status}${engine.error ? `: ${engine.error}` : ""}`;
}
</script>

<template>
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[13px] text-slate-500">
		<span>
			<span class="text-slate-300">{{ formatNumber(count) }}</span> results
			<span>({{ timeMs }} ms{{ cached ? ", cached" : "" }})</span>
		</span>
		<span v-if="engines.length" class="flex flex-wrap items-center gap-1.5">
			<span>Engines:</span>
			<UTooltip v-for="engine in engines" :key="engine.slug" :text="describe(engine)">
				<span class="rounded-md border bg-slate-900/60 px-2 py-0.5 text-xs" :class="STATUS_COLORS[engine.status]">
					{{ engine.slug }}
				</span>
			</UTooltip>
		</span>
	</div>
</template>
