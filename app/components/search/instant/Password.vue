<script setup lang="ts">
/** Password generator — regenerates locally with the browser's CSPRNG. */
const props = defineProps<{ data: Record<string, any> }>();

const length = ref<number>(props.data.length ?? 20);
const value = ref<string>(props.data.value);
const revealed = ref(true);

function generate() {
	const charset: string = props.data.charset;
	const bytes = new Uint32Array(length.value);
	crypto.getRandomValues(bytes);
	value.value = Array.from(bytes, (b) => charset[b % charset.length]).join("");
}
</script>

<template>
	<div class="space-y-4">
		<div class="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
			<code class="flex-1 font-mono text-lg break-all text-white">
				{{ revealed ? value : "•".repeat(value.length) }}
			</code>
			<UButton
				:icon="revealed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
				color="neutral"
				variant="ghost"
				:aria-label="revealed ? 'Hide password' : 'Show password'"
				@click="revealed = !revealed"
			/>
			<UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy password" @click="copyText(value)" />
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<div class="flex min-w-48 flex-1 items-center gap-3">
				<span class="w-20 text-sm text-slate-400">{{ length }} chars</span>
				<USlider v-model="length" :min="8" :max="128" class="flex-1" @update:model-value="generate" />
			</div>
			<UButton label="Regenerate" icon="i-lucide-refresh-cw" color="primary" variant="soft" @click="generate" />
		</div>
		<p class="text-xs text-slate-500">Generated in your browser — the new password never leaves your device.</p>
	</div>
</template>
