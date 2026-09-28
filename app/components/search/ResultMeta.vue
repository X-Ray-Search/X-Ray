<script setup lang="ts">
import type { EngineStatus } from "~/utils/types";

defineProps<{ count: number; timeMs: number; engines: EngineStatus[]; cached: boolean }>();

const STATUS_COLORS: Record<EngineStatus["status"], string> = {
	ok: "border-slate-700 text-slate-300",
	error: "border-red-900/70 text-red-400",
	timeout: "border-amber-900/70 text-amber-400",
	blocked: "border-red-900/70 text-red-400",
	suspended: "border-slate-800 text-slate-600 line-through",
	throttled: "border-amber-900/70 text-amber-400",
};

function describe(engine: EngineStatus) {
	let text: string;
	if (engine.cached === "stale") {
		const reason = engine.status === "ok" ? "no new results" : engine.status;
		text = `${reason}${engine.error ? `: ${engine.error}` : ""} — showing ${engine.results} earlier cached results`;
	} else if (engine.status === "ok") {
		text = engine.cached
			? `${engine.results} results (cached)`
			: `${engine.results} results in ${engine.time_ms} ms`;
	} else {
		text = `${engine.status}${engine.error ? `: ${engine.error}` : ""}`;
	}
	return engine.fallback ? `${text} · fallback engine` : text;
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
				<span
					class="inline-flex items-center gap-1 rounded-md border bg-slate-900/60 px-2 py-0.5 text-xs"
					:class="[STATUS_COLORS[engine.status], engine.cached === 'stale' && 'border-dashed no-underline']"
				>
					<UIcon v-if="engine.fallback" name="i-lucide-life-buoy" class="size-3" />
					{{ engine.slug }}
				</span>
			</UTooltip>
		</span>
	</div>
</template>
