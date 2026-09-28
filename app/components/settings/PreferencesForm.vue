<script setup lang="ts">
/**
 * Search preferences editor, shared by
 * - users (`mode="user"`): `values` holds only their overrides; untouched fields follow the
 *   instance default, and each overridden field can be reset;
 * - admins (`mode="admin"`): `values` is the complete set of instance defaults.
 */
import type { InstanceInfo, SearchPreferences } from "~/utils/types";

type Key = keyof SearchPreferences;

const props = defineProps<{
	mode: "user" | "admin";
	defaults: SearchPreferences;
	instance: InstanceInfo;
	aiAvailable: boolean;
}>();

const values = defineModel<Partial<SearchPreferences>>({ required: true });

function current<K extends Key>(key: K): SearchPreferences[K] {
	return (values.value[key] ?? props.defaults[key]) as SearchPreferences[K];
}

function isOverridden(key: Key) {
	return props.mode === "user" && values.value[key] !== undefined;
}

function set<K extends Key>(key: K, value: SearchPreferences[K]) {
	const next = { ...values.value };
	// Users: picking the instance default again means "follow the instance".
	if (props.mode === "user" && JSON.stringify(value) === JSON.stringify(props.defaults[key])) {
		delete next[key];
	} else {
		next[key] = value;
	}
	values.value = next;
}

function reset(key: Key) {
	const next = { ...values.value };
	delete next[key];
	values.value = next;
}

/** Two-way binding for one key, for v-model on inputs. */
function field<K extends Key>(key: K) {
	return computed({
		get: () => current(key),
		set: (value: SearchPreferences[K]) => set(key, value),
	});
}

const defaultCategory = field("default_category");
const language = field("language");
const safesearch = field("safesearch");
const openInNewTab = field("open_in_new_tab");
const imageProxy = field("image_proxy");
const autocomplete = field("autocomplete");
const bangsEnabled = field("bangs_enabled");
const ddgBangsEnabled = field("ddg_bangs_enabled");
const instantAnswersEnabled = field("instant_answers_enabled");
const aiMode = field("ai_mode");
const units = field("units");

// ---------------------------------------------------------------- options

const categoryItems = SEARCH_CATEGORIES.map((c) => ({ label: c.label, value: c.id, icon: c.icon }));

const LOCALES = [
	"en",
	"en-US",
	"en-GB",
	"de",
	"de-DE",
	"de-AT",
	"de-CH",
	"fr",
	"fr-FR",
	"es",
	"es-ES",
	"it",
	"nl",
	"pt",
	"pt-BR",
	"pl",
	"sv",
	"da",
	"fi",
	"nb",
	"cs",
	"hu",
	"ro",
	"el",
	"tr",
	"ru",
	"uk",
	"ja",
	"ko",
	"zh",
	"ar",
	"he",
	"hi",
];
const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageItems = [
	{ label: "All languages", value: "all" },
	...LOCALES.map((code) => ({ label: `${displayNames.of(code) ?? code} (${code})`, value: code })),
];

const safesearchItems = [
	{ label: "Off", value: 0, description: "Show everything" },
	{ label: "Moderate", value: 1, description: "Hide explicit images and videos" },
	{ label: "Strict", value: 2, description: "Filter explicit content everywhere" },
];

const autocompleteItems = computed(() =>
	props.instance.autocomplete_providers.map((p) => ({ label: p.name, value: p.id })),
);

const aiItems = [
	{ label: "Off", value: "off", description: "Never show AI answers" },
	{ label: "On request", value: "manual", description: "Show an “Ask AI” button" },
	{ label: "Automatic", value: "auto", description: "Answer every web search" },
];

const unitItems = [
	{ label: "Metric (°C, km/h)", value: "metric" },
	{ label: "Imperial (°F, mph)", value: "imperial" },
];

const labelOf = (items: ReadonlyArray<{ label: string; value: unknown }>, value: unknown) =>
	items.find((item) => item.value === value)?.label;

// ---------------------------------------------------------------- instant answers & engines

const disabledAnswers = computed(() => current("disabled_instant_answers"));
function toggleAnswer(id: string, enabled: boolean) {
	const set_ = new Set(disabledAnswers.value);
	if (enabled) set_.delete(id);
	else set_.add(id);
	set("disabled_instant_answers", [...set_].sort());
}

const disabledEngines = computed(() => current("disabled_engines"));
function toggleEngine(slug: string, enabled: boolean) {
	const set_ = new Set(disabledEngines.value);
	if (enabled) set_.delete(slug);
	else set_.add(slug);
	set("disabled_engines", [...set_].sort());
}

const enginesByCategory = computed(() =>
	SEARCH_CATEGORIES.map((category) => ({
		...category,
		engines: props.instance.engines.filter((e) => e.categories.includes(category.id)),
	})).filter((group) => group.engines.length),
);

const sectionClass =
	"overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm";
const headerClass = "flex items-center gap-3 border-b border-slate-800 px-6 py-4";
</script>

<template>
	<div class="space-y-6">
		<!-- Results -->
		<section :class="sectionClass">
			<div :class="headerClass">
				<div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<UIcon name="i-lucide-search" class="size-5 text-primary" />
				</div>
				<div>
					<h3 class="font-medium text-white">Results</h3>
					<p class="text-sm text-slate-400">What you search in and how results open</p>
				</div>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<SettingsPreferenceRow
					label="Default category"
					description="Used when you search from the home page or the address bar."
					:mode="mode"
					:overridden="isOverridden('default_category')"
					:default-label="labelOf(categoryItems, defaults.default_category)"
					@reset="reset('default_category')"
				>
					<USelect v-model="defaultCategory" :items="categoryItems" class="w-full sm:w-56" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Search language & region"
					description="Engines prefer results in this language and region."
					:mode="mode"
					:overridden="isOverridden('language')"
					:default-label="labelOf(languageItems, defaults.language)"
					@reset="reset('language')"
				>
					<USelectMenu v-model="language" :items="languageItems" value-key="value" class="w-full sm:w-64" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Safe search"
					:mode="mode"
					:overridden="isOverridden('safesearch')"
					:default-label="labelOf(safesearchItems, defaults.safesearch)"
					@reset="reset('safesearch')"
				>
					<URadioGroup v-model="safesearch" :items="safesearchItems" orientation="vertical" class="sm:text-left" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Open results in a new tab"
					:mode="mode"
					:overridden="isOverridden('open_in_new_tab')"
					@reset="reset('open_in_new_tab')"
				>
					<USwitch v-model="openInNewTab" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Proxy images"
					description="Load thumbnails and favicons through this instance, so image hosts never see your IP."
					:mode="mode"
					:overridden="isOverridden('image_proxy')"
					@reset="reset('image_proxy')"
				>
					<USwitch v-model="imageProxy" />
				</SettingsPreferenceRow>
			</div>
		</section>

		<!-- Suggestions & bangs -->
		<section :class="sectionClass">
			<div :class="headerClass">
				<div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<UIcon name="i-lucide-zap" class="size-5 text-primary" />
				</div>
				<div>
					<h3 class="font-medium text-white">Suggestions & bangs</h3>
					<p class="text-sm text-slate-400">Typing help and shortcuts like <code class="font-mono text-primary">!w</code></p>
				</div>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<SettingsPreferenceRow
					label="Search suggestions"
					description="Suggestions are fetched through this instance, never from your browser."
					:mode="mode"
					:overridden="isOverridden('autocomplete')"
					:default-label="labelOf(autocompleteItems, defaults.autocomplete)"
					@reset="reset('autocomplete')"
				>
					<USelect v-model="autocomplete" :items="autocompleteItems" class="w-full sm:w-56" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Bangs"
					description="Jump straight to a site with shortcuts such as !w linux or !yt music."
					:mode="mode"
					:overridden="isOverridden('bangs_enabled')"
					@reset="reset('bangs_enabled')"
				>
					<USwitch v-model="bangsEnabled" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="DuckDuckGo bangs"
					description="Include the ~13,000 bangs from DuckDuckGo in addition to custom ones."
					:mode="mode"
					:overridden="isOverridden('ddg_bangs_enabled')"
					@reset="reset('ddg_bangs_enabled')"
				>
					<USwitch v-model="ddgBangsEnabled" :disabled="!bangsEnabled" />
				</SettingsPreferenceRow>
			</div>
		</section>

		<!-- Answers -->
		<section :class="sectionClass">
			<div :class="headerClass">
				<div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
				</div>
				<div>
					<h3 class="font-medium text-white">Answers</h3>
					<p class="text-sm text-slate-400">Calculator, conversions, weather and AI answers above the results</p>
				</div>
			</div>
			<div class="divide-y divide-slate-800 p-6">
				<SettingsPreferenceRow
					label="AI answers"
					:description="aiAvailable ? 'Answers are generated from the top results and cite their sources.' : 'The administrator has not configured an AI endpoint yet.'"
					:mode="mode"
					:overridden="isOverridden('ai_mode')"
					:default-label="labelOf(aiItems, defaults.ai_mode)"
					@reset="reset('ai_mode')"
				>
					<URadioGroup
						v-model="aiMode"
						:items="aiItems"
						orientation="vertical"
						class="sm:text-left"
						:disabled="!aiAvailable && mode === 'user'"
					/>
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Instant answers"
					:mode="mode"
					:overridden="isOverridden('instant_answers_enabled')"
					@reset="reset('instant_answers_enabled')"
				>
					<USwitch v-model="instantAnswersEnabled" />
				</SettingsPreferenceRow>

				<SettingsPreferenceRow
					label="Units"
					:mode="mode"
					:overridden="isOverridden('units')"
					:default-label="labelOf(unitItems, defaults.units)"
					@reset="reset('units')"
				>
					<USelect v-model="units" :items="unitItems" class="w-full sm:w-56" />
				</SettingsPreferenceRow>

				<div class="py-4 last:pb-0">
					<div class="mb-3 flex flex-wrap items-center gap-2">
						<p class="font-medium text-white">Individual answers</p>
						<template v-if="mode === 'user'">
							<UBadge v-if="isOverridden('disabled_instant_answers')" label="Custom" size="sm" variant="subtle" />
							<button
								v-if="isOverridden('disabled_instant_answers')"
								type="button"
								class="text-xs text-slate-500 hover:text-primary"
								@click="reset('disabled_instant_answers')"
							>
								Use instance default
							</button>
						</template>
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<label
							v-for="provider in instance.instant_answer_providers"
							:key="provider.id"
							class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 p-3 transition hover:border-slate-700"
							:class="!instantAnswersEnabled ? 'pointer-events-none opacity-50' : ''"
						>
							<UCheckbox
								:model-value="!disabledAnswers.includes(provider.id)"
								@update:model-value="(v) => toggleAnswer(provider.id, v === true)"
							/>
							<span class="min-w-0">
								<span class="block text-sm font-medium text-slate-200">{{ provider.name }}</span>
								<span class="block text-xs text-slate-500">{{ provider.description }}</span>
							</span>
						</label>
					</div>
				</div>
			</div>
		</section>

		<!-- Engines -->
		<section :class="sectionClass">
			<div :class="headerClass">
				<div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<UIcon name="i-lucide-radar" class="size-5 text-primary" />
				</div>
				<div class="flex-1">
					<h3 class="font-medium text-white">Engines</h3>
					<p class="text-sm text-slate-400">Which of this instance's engines to ask</p>
				</div>
				<button
					v-if="isOverridden('disabled_engines')"
					type="button"
					class="text-xs text-slate-500 hover:text-primary"
					@click="reset('disabled_engines')"
				>
					Use instance default
				</button>
			</div>
			<div class="space-y-5 p-6">
				<div v-for="group in enginesByCategory" :key="group.id">
					<p class="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-300">
						<UIcon :name="group.icon" class="size-4 text-slate-500" />
						{{ group.label }}
					</p>
					<div class="flex flex-wrap gap-2">
						<label
							v-for="engine in group.engines"
							:key="engine.slug"
							class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm transition hover:border-slate-700"
						>
							<UCheckbox
								:model-value="!disabledEngines.includes(engine.slug)"
								@update:model-value="(v) => toggleEngine(engine.slug, v === true)"
							/>
							{{ engine.name }}
						</label>
					</div>
				</div>
				<p v-if="!enginesByCategory.length" class="text-sm text-slate-500">No engines are enabled on this instance.</p>
			</div>
		</section>
	</div>
</template>
