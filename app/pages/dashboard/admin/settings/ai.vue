<script setup lang="ts">
import type { GetAdminSettingsAiResponses } from "~/api-client";
import { useInstanceStore } from "~/composables/stores/useInstanceStore";

type AIConfig = GetAdminSettingsAiResponses["200"]["data"];

useSeoMeta({ title: "AI settings | X-Ray" });

const toast = useToast();

const res = await useAPI((api) => api.getAdminSettingsAi({}));
if (!res.success) throw createError({ statusCode: res.code, statusMessage: res.message });

const config = ref<AIConfig>(res.data);

function editable(c: AIConfig) {
	return {
		enabled: c.enabled,
		base_url: c.base_url,
		model: c.model,
		system_prompt: c.system_prompt,
		temperature: c.temperature,
		max_tokens: c.max_tokens,
		context_results: c.context_results,
		timeout_ms: c.timeout_ms,
		headers: Object.entries(c.extra_headers).map(([name, value]) => ({ name, value })),
	};
}

const form = reactive(editable(config.value));
/** New key to store; empty = keep the stored one. */
const apiKey = ref("");
const removeKey = ref(false);
const saved = ref(JSON.stringify(form));
const dirty = computed(
	() => JSON.stringify(form) !== saved.value || !!apiKey.value || removeKey.value,
);

const presets = [
	{ label: "OpenAI", url: "https://api.openai.com/v1" },
	{ label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
	{ label: "Ollama", url: "http://localhost:11434/v1" },
	{ label: "LM Studio", url: "http://localhost:1234/v1" },
];

function body() {
	return {
		enabled: form.enabled,
		base_url: form.base_url.trim(),
		model: form.model.trim(),
		system_prompt: form.system_prompt,
		temperature: form.temperature,
		max_tokens: form.max_tokens,
		context_results: form.context_results,
		timeout_ms: form.timeout_ms,
		extra_headers: Object.fromEntries(
			form.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value]),
		),
		...(removeKey.value ? { api_key: null } : apiKey.value ? { api_key: apiKey.value } : {}),
	};
}

const saving = ref(false);
async function save() {
	saving.value = true;
	const result = await useAPI((api) => api.putAdminSettingsAi({ body: body() }));
	saving.value = false;
	if (!result.success) {
		toast.add({ title: "Could not save", description: result.message, color: "error" });
		return;
	}
	config.value = result.data;
	Object.assign(form, editable(result.data));
	saved.value = JSON.stringify(form);
	apiKey.value = "";
	removeKey.value = false;
	await useInstanceStore().refresh();
	toast.add({ title: "AI settings saved", icon: "i-lucide-check", color: "success" });
}

const testing = ref(false);
const testResult = ref<{
	ok: boolean;
	latency_ms: number;
	reply: string | null;
	error: string | null;
} | null>(null);
async function test() {
	testing.value = true;
	const result = await useAPI((api) => api.postAdminSettingsAiTest({ body: body() }));
	testing.value = false;
	testResult.value = result.success
		? result.data
		: { ok: false, latency_ms: 0, reply: null, error: result.message };
}

const models = ref<string[]>([]);
const loadingModels = ref(false);
async function loadModels() {
	loadingModels.value = true;
	const result = await useAPI((api) => api.postAdminSettingsAiModels({ body: body() }));
	loadingModels.value = false;
	if (!result.success || result.data.error) {
		toast.add({
			title: "Could not list models",
			description: result.success ? (result.data.error ?? undefined) : result.message,
			color: "error",
		});
		return;
	}
	models.value = result.data.models;
	if (!models.value.length)
		toast.add({ title: "The endpoint returned no models", color: "warning" });
}
const modelFilter = ref("");
const filteredModels = computed(() =>
	models.value.filter((m) => m.toLowerCase().includes(modelFilter.value.toLowerCase())).slice(0, 60),
);

const sectionClass =
	"overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm";
const rowClass = "flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 max-sm:flex-col";
</script>

<template>
	<form class="space-y-6" @submit.prevent="save">
		<UAlert
			color="neutral"
			variant="subtle"
			icon="i-lucide-shield-check"
			title="Privacy"
			description="Only the query and the top search results are sent to the model — never who searched. Point this at a local model (Ollama, LM Studio, vLLM) to keep everything on your own hardware."
		/>

		<section :class="sectionClass">
			<div class="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
				<div>
					<h3 class="font-medium text-white">OpenAI compatible endpoint</h3>
					<p class="text-sm text-slate-400">Any server implementing <code class="font-mono">/chat/completions</code></p>
				</div>
				<USwitch v-model="form.enabled" label="Enabled" />
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField label="Base URL" :class="rowClass">
					<div class="w-full space-y-2 sm:w-96">
						<UInput v-model="form.base_url" placeholder="https://api.openai.com/v1" class="w-full font-mono text-sm" />
						<div class="flex flex-wrap gap-1.5">
							<UButton
								v-for="preset in presets"
								:key="preset.label"
								:label="preset.label"
								size="xs"
								color="neutral"
								variant="soft"
								@click="form.base_url = preset.url"
							/>
						</div>
					</div>
				</UFormField>

				<UFormField label="API key" description="Stored on the server; never shown again." :class="rowClass">
					<div class="w-full space-y-2 sm:w-96">
						<UInput
							v-model="apiKey"
							type="password"
							autocomplete="off"
							:placeholder="config.api_key_set && !removeKey ? '•••••••• (stored — leave empty to keep)' : 'Not set (optional for local models)'"
							class="w-full"
							:disabled="removeKey"
						/>
						<UCheckbox v-if="config.api_key_set" v-model="removeKey" label="Remove the stored key" />
					</div>
				</UFormField>

				<UFormField label="Model" :class="rowClass">
					<div class="w-full space-y-2 sm:w-96">
						<div class="flex gap-2">
							<UInput v-model="form.model" placeholder="gpt-4o-mini, llama3.1, …" class="flex-1 font-mono text-sm" />
							<UButton label="Load" icon="i-lucide-list" color="neutral" variant="soft" :loading="loadingModels" @click="loadModels" />
						</div>
						<div v-if="models.length" class="space-y-2 rounded-lg border border-slate-800 p-2">
							<UInput v-model="modelFilter" size="sm" icon="i-lucide-search" placeholder="Filter models" class="w-full" />
							<div class="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
								<button
									v-for="model in filteredModels"
									:key="model"
									type="button"
									class="rounded-md border px-2 py-0.5 font-mono text-xs transition"
									:class="model === form.model ? 'border-primary/50 bg-primary/10 text-primary' : 'border-slate-800 text-slate-400 hover:text-white'"
									@click="form.model = model"
								>
									{{ model }}
								</button>
							</div>
						</div>
					</div>
				</UFormField>

				<div class="flex flex-wrap items-center gap-3 py-4 last:pb-0">
					<UButton label="Test connection" icon="i-lucide-plug-zap" color="neutral" variant="soft" :loading="testing" @click="test" />
					<span v-if="testResult" class="text-sm" :class="testResult.ok ? 'text-emerald-400' : 'text-red-400'">
						<template v-if="testResult.ok">Replied “{{ testResult.reply }}” in {{ testResult.latency_ms }} ms</template>
						<template v-else>{{ testResult.error }}</template>
					</span>
				</div>
			</div>
		</section>

		<section :class="sectionClass">
			<div class="border-b border-slate-800 px-6 py-4">
				<h3 class="font-medium text-white">Answers</h3>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<UFormField label="Search results as context" description="How many top results the model sees." :class="rowClass">
					<UInputNumber v-model="form.context_results" :min="1" :max="20" class="w-full sm:w-40" />
				</UFormField>
				<UFormField :label="`Temperature (${form.temperature.toFixed(1)})`" description="Lower is more factual." :class="rowClass">
					<USlider v-model="form.temperature" :min="0" :max="2" :step="0.1" class="w-full sm:w-60" />
				</UFormField>
				<UFormField label="Max tokens" :class="rowClass">
					<UInputNumber v-model="form.max_tokens" :min="16" :max="32000" :step="64" class="w-full sm:w-40" />
				</UFormField>
				<UFormField label="Timeout (ms)" :class="rowClass">
					<UInputNumber v-model="form.timeout_ms" :min="1000" :max="300000" :step="1000" class="w-full sm:w-40" />
				</UFormField>
				<div class="space-y-2 py-4 last:pb-0">
					<div class="flex items-center justify-between">
						<p class="font-medium text-white">System prompt</p>
						<UButton
							label="Reset to default"
							size="xs"
							color="neutral"
							variant="ghost"
							icon="i-lucide-rotate-ccw"
							:disabled="form.system_prompt === config.default_system_prompt"
							@click="form.system_prompt = config.default_system_prompt"
						/>
					</div>
					<UTextarea v-model="form.system_prompt" :rows="5" autoresize class="w-full text-sm" />
				</div>
				<div class="space-y-2 py-4 last:pb-0">
					<div class="flex items-center justify-between">
						<div>
							<p class="font-medium text-white">Extra headers</p>
							<p class="text-sm text-slate-400">E.g. <code class="font-mono">HTTP-Referer</code> for OpenRouter or a gateway token.</p>
						</div>
						<UButton label="Add" size="xs" icon="i-lucide-plus" color="neutral" variant="soft" @click="form.headers.push({ name: '', value: '' })" />
					</div>
					<div v-for="(header, index) in form.headers" :key="index" class="flex gap-2">
						<UInput v-model="header.name" placeholder="Header" class="w-1/3 font-mono text-sm" />
						<UInput v-model="header.value" placeholder="Value" class="flex-1 font-mono text-sm" />
						<UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove header" @click="form.headers.splice(index, 1)" />
					</div>
				</div>
			</div>
		</section>

		<div class="flex justify-end">
			<UButton type="submit" label="Save AI settings" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!dirty" />
		</div>
	</form>
</template>
