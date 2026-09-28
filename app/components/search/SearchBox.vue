<script setup lang="ts">
/**
 * The search input: suggestions as you type, bang completion (`!w` → Wikipedia) and a live chip
 * that shows where a bang in the query will take you — like DuckDuckGo.
 */
import type { BangSuggestion } from "~/utils/types";

const props = withDefaults(
	defineProps<{
		size?: "md" | "lg";
		autofocus?: boolean;
		placeholder?: string;
		/** Load favicons through the media proxy. */
		imageProxy?: boolean;
		/** Disable suggestions (e.g. signed-out visitor on a private instance). */
		disableSuggestions?: boolean;
	}>(),
	{ size: "md", autofocus: false, placeholder: "Search without being tracked…", imageProxy: true },
);

const emit = defineEmits<{ submit: [query: string] }>();
const query = defineModel<string>({ default: "" });

const inputRef = useTemplateRef<HTMLInputElement>("input");
const focused = ref(false);
const open = ref(false);
const highlighted = ref(-1);
const suggestions = ref<string[]>([]);
const bangSuggestions = ref<BangSuggestion[]>([]);
const listboxId = useId();

// ------------------------------------------------------------------ bang detection

/** Known bangs by trigger (`null` = looked up, does not exist). Filled from every response. */
const bangCache = reactive(new Map<string, BangSuggestion | null>());

function rememberBangs(bangs: BangSuggestion[]) {
	for (const bang of bangs) bangCache.set(bang.trigger, bang);
}

/** The first bang-looking token of the query, e.g. `w` for `linux !w`. */
const bangToken = computed(() => {
	const token = query.value.split(/\s+/).find((t) => t.startsWith("!"));
	return token === undefined ? null : token.slice(1).toLowerCase();
});

const activeBang = computed<BangSuggestion | "lucky" | null>(() => {
	const token = bangToken.value;
	if (token === null) return null;
	if (token === "") return query.value.trim() !== "!" ? "lucky" : null;
	return bangCache.get(token) ?? null;
});

let lookupTimer: ReturnType<typeof setTimeout> | undefined;
watch(bangToken, (token) => {
	clearTimeout(lookupTimer);
	if (!token || bangCache.has(token) || props.disableSuggestions) return;
	lookupTimer = setTimeout(async () => {
		const res = await useAPI((api) => api.getBangsSuggest({ query: { q: token, limit: 8 } }), true);
		if (!res.success) return;
		rememberBangs(res.data);
		if (!bangCache.has(token)) bangCache.set(token, null);
	}, 150);
});

// ------------------------------------------------------------------ suggestions

let suggestTimer: ReturnType<typeof setTimeout> | undefined;
let requestCounter = 0;

watch(query, (value) => {
	clearTimeout(suggestTimer);
	highlighted.value = -1;
	if (props.disableSuggestions || !focused.value || !value.trim()) {
		suggestions.value = [];
		bangSuggestions.value = [];
		return;
	}
	const request = ++requestCounter;
	suggestTimer = setTimeout(async () => {
		const res = await useAPI((api) => api.getSearchAutocomplete({ query: { q: value } }), true);
		if (request !== requestCounter || !res.success) return;
		suggestions.value = res.data.suggestions
			.filter((s) => s.toLowerCase() !== value.trim().toLowerCase())
			.slice(0, 8);
		bangSuggestions.value = res.data.bangs;
		rememberBangs(res.data.bangs);
		open.value = focused.value;
	}, 120);
});

type Option = { kind: "suggestion"; value: string } | { kind: "bang"; bang: BangSuggestion };

const options = computed<Option[]>(() =>
	bangSuggestions.value.length
		? bangSuggestions.value.map((bang) => ({ kind: "bang", bang }))
		: suggestions.value.map((value) => ({ kind: "suggestion", value })),
);

const showDropdown = computed(() => open.value && focused.value && options.value.length > 0);

/** Replace the `!…` token being typed with the chosen bang. */
function completeBang(bang: BangSuggestion) {
	const tokens = query.value.split(/(\s+)/);
	for (let i = tokens.length - 1; i >= 0; i--) {
		if (tokens[i]?.startsWith("!")) {
			tokens[i] = `!${bang.trigger}`;
			break;
		}
	}
	let next = tokens.join("");
	if (!next.endsWith(" ")) next += " ";
	query.value = next;
	bangSuggestions.value = [];
	open.value = false;
	nextTick(() => inputRef.value?.focus());
}

function choose(option: Option) {
	if (option.kind === "bang") return completeBang(option.bang);
	query.value = option.value;
	submit();
}

function submit() {
	const value = query.value.trim();
	if (!value) return;
	open.value = false;
	inputRef.value?.blur();
	emit("submit", value);
}

function onKeydown(event: KeyboardEvent) {
	const count = options.value.length;
	if (event.key === "ArrowDown" && count) {
		event.preventDefault();
		open.value = true;
		highlighted.value = (highlighted.value + 1) % count;
	} else if (event.key === "ArrowUp" && count) {
		event.preventDefault();
		highlighted.value = highlighted.value <= 0 ? count - 1 : highlighted.value - 1;
	} else if (event.key === "Enter") {
		event.preventDefault();
		const option = showDropdown.value ? options.value[highlighted.value] : undefined;
		if (option) choose(option);
		else submit();
	} else if (event.key === "Tab" && showDropdown.value && bangSuggestions.value.length) {
		event.preventDefault();
		const option = options.value[Math.max(highlighted.value, 0)];
		if (option) choose(option);
	} else if (event.key === "Escape") {
		open.value = false;
	}
}

function onFocus() {
	focused.value = true;
	if (options.value.length) open.value = true;
}

function onBlur() {
	// Delay so clicks on options land before the dropdown closes.
	setTimeout(() => {
		focused.value = false;
		open.value = false;
	}, 150);
}

function clear() {
	query.value = "";
	suggestions.value = [];
	bangSuggestions.value = [];
	inputRef.value?.focus();
}

function bangFavicon(bang: BangSuggestion) {
	return bang.domain ? faviconURL(`https://${bang.domain}`, props.imageProxy) : null;
}

const categoryInfo = (id: string | null) => SEARCH_CATEGORIES.find((c) => c.id === id);

const submitIcon = computed(() =>
	activeBang.value && activeBang.value !== "lucky" && !activeBang.value.switches_category
		? "i-lucide-arrow-up-right"
		: "i-lucide-arrow-right",
);

defineExpose({ focus: () => inputRef.value?.focus() });

onMounted(() => {
	if (props.autofocus) inputRef.value?.focus();
});
</script>

<template>
	<div class="relative w-full">
		<form
			role="search"
			class="group flex items-stretch overflow-hidden border bg-[#0c0e13] transition-all duration-150"
			:class="[
				size === 'lg' ? 'h-14 rounded-2xl' : 'h-12 rounded-xl',
				showDropdown ? 'rounded-b-none border-slate-700 border-b-transparent' : '',
				focused
					? 'border-primary/60 shadow-[0_0_0_4px_rgb(0_240_220/0.10)]'
					: 'border-slate-800 hover:border-slate-700',
			]"
			@submit.prevent="submit"
		>
			<div class="flex min-w-0 flex-1 items-center gap-3 pl-4 pr-2">
				<UIcon name="i-lucide-search" class="size-5 shrink-0 text-slate-500" />
				<input
					ref="input"
					v-model="query"
					type="text"
					name="q"
					:placeholder="placeholder"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					enterkeyhint="search"
					role="combobox"
					:aria-expanded="showDropdown"
					:aria-controls="listboxId"
					:aria-activedescendant="highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined"
					aria-autocomplete="list"
					aria-label="Search"
					class="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
					:class="size === 'lg' ? 'text-lg' : 'text-base'"
					@keydown="onKeydown"
					@focus="onFocus"
					@blur="onBlur"
				/>

				<!-- Bang feedback -->
				<Transition
					enter-active-class="transition duration-150"
					enter-from-class="opacity-0 translate-x-1"
					leave-active-class="transition duration-100"
					leave-to-class="opacity-0"
				>
					<span
						v-if="activeBang"
						class="hidden max-w-[45%] shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary sm:inline-flex"
						:title="activeBang === 'lucky' ? 'Opens the first result' : `Search on ${activeBang.name}`"
					>
						<template v-if="activeBang === 'lucky'">
							<UIcon name="i-lucide-dices" class="size-3.5" />
							<span>Feeling lucky</span>
						</template>
						<template v-else-if="activeBang.switches_category">
							<UIcon :name="categoryInfo(activeBang.switches_category)?.icon ?? 'i-lucide-search'" class="size-3.5" />
							<span class="truncate">{{ categoryInfo(activeBang.switches_category)?.label }}</span>
						</template>
						<template v-else>
							<img
								v-if="bangFavicon(activeBang)"
								:src="bangFavicon(activeBang)!"
								alt=""
								class="size-3.5 rounded-sm"
								loading="lazy"
								@error="($event.target as HTMLImageElement).style.display = 'none'"
							/>
							<UIcon v-else name="i-lucide-arrow-up-right" class="size-3.5" />
							<span class="truncate">{{ activeBang.name }}</span>
						</template>
					</span>
				</Transition>

				<button
					v-if="query"
					type="button"
					class="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
					aria-label="Clear search"
					@mousedown.prevent
					@click="clear"
				>
					<UIcon name="i-lucide-x" class="size-4.5" />
				</button>
			</div>

			<button
				type="submit"
				class="flex shrink-0 items-center justify-center bg-primary text-[#041413] transition hover:bg-primary-300 disabled:opacity-60"
				:class="size === 'lg' ? 'w-16' : 'w-14'"
				:aria-label="submitIcon === 'i-lucide-arrow-up-right' ? 'Go' : 'Search'"
			>
				<UIcon :name="submitIcon" class="size-5" />
			</button>
		</form>

		<!-- Suggestions -->
		<ul
			v-if="showDropdown"
			:id="listboxId"
			role="listbox"
			class="absolute inset-x-0 top-full z-50 overflow-hidden rounded-b-2xl border border-t-0 border-slate-700 bg-[#0c0e13] py-1.5 shadow-2xl shadow-black/60"
		>
			<li
				v-for="(option, index) in options"
				:id="`${listboxId}-${index}`"
				:key="option.kind === 'bang' ? `b-${option.bang.trigger}` : `s-${option.value}`"
				role="option"
				:aria-selected="index === highlighted"
				class="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm"
				:class="index === highlighted ? 'bg-slate-800/80 text-white' : 'text-slate-300 hover:bg-slate-800/50'"
				@mousedown.prevent="choose(option)"
				@mousemove="highlighted = index"
			>
				<template v-if="option.kind === 'suggestion'">
					<UIcon name="i-lucide-search" class="size-4 shrink-0 text-slate-500" />
					<span class="truncate">{{ option.value }}</span>
				</template>

				<template v-else>
					<span class="flex size-5 shrink-0 items-center justify-center">
						<UIcon
							v-if="option.bang.switches_category"
							:name="categoryInfo(option.bang.switches_category)?.icon ?? 'i-lucide-search'"
							class="size-4 text-primary"
						/>
						<img
							v-else-if="bangFavicon(option.bang)"
							:src="bangFavicon(option.bang)!"
							alt=""
							class="size-4 rounded-sm"
							loading="lazy"
						/>
						<UIcon v-else name="i-lucide-zap" class="size-4 text-slate-500" />
					</span>
					<span class="shrink-0 font-mono text-primary">!{{ option.bang.trigger }}</span>
					<span class="min-w-0 truncate">{{ option.bang.name }}</span>
					<span class="ml-auto hidden shrink-0 font-mono text-xs text-slate-500 sm:inline">
						{{ option.bang.domain }}
					</span>
					<UBadge
						v-if="option.bang.source === 'user' || option.bang.source === 'instance'"
						:label="option.bang.source === 'user' ? 'mine' : 'instance'"
						size="sm"
						variant="subtle"
						color="primary"
						class="shrink-0"
					/>
				</template>
			</li>
			<li
				v-if="bangSuggestions.length"
				class="px-4 pt-1.5 pb-0.5 text-[11px] text-slate-500"
				role="presentation"
			>
				<UKbd value="Tab" size="sm" /> to complete · bangs take you straight to the site
			</li>
		</ul>
	</div>
</template>
