<script setup lang="ts">
/**
 * The AI chat input: a textarea that grows with its content. Enter sends, Shift+Enter starts a
 * new line; while an answer streams, the send button turns into a stop button.
 */
const props = withDefaults(
	defineProps<{
		placeholder?: string;
		busy?: boolean;
		disabled?: boolean;
		autofocus?: boolean;
	}>(),
	{ placeholder: "Ask anything…", busy: false, disabled: false, autofocus: false },
);

const emit = defineEmits<{ submit: [content: string]; stop: [] }>();
const content = defineModel<string>({ default: "" });

const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");

function resize() {
	const el = textarea.value;
	if (!el) return;
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}
watch(content, () => nextTick(resize));

function submit() {
	const value = content.value.trim();
	if (!value || props.busy || props.disabled) return;
	emit("submit", value);
}

function onKeydown(event: KeyboardEvent) {
	if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	submit();
}

onMounted(() => {
	resize();
	if (props.autofocus) textarea.value?.focus();
});

defineExpose({ focus: () => textarea.value?.focus() });
</script>

<template>
	<form
		class="flex items-end gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/80 p-2 pl-4 shadow-lg shadow-black/20 backdrop-blur transition focus-within:border-primary/50"
		:class="disabled ? 'opacity-60' : ''"
		@submit.prevent="submit"
	>
		<textarea
			ref="textarea"
			v-model="content"
			rows="1"
			:placeholder="placeholder"
			:disabled="disabled"
			:aria-label="placeholder"
			class="max-h-60 flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] leading-6 text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed"
			@keydown="onKeydown"
		/>
		<UButton
			v-if="busy"
			type="button"
			icon="i-lucide-square"
			color="neutral"
			variant="soft"
			class="rounded-xl"
			aria-label="Stop"
			@click="emit('stop')"
		/>
		<UButton
			v-else
			type="submit"
			icon="i-lucide-arrow-up"
			color="primary"
			class="rounded-xl"
			:disabled="disabled || !content.trim()"
			aria-label="Send"
		/>
	</form>
</template>
