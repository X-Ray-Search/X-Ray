<script setup lang="ts">
const props = withDefaults(defineProps<{ url: string; proxy?: boolean }>(), { proxy: true });

const failed = ref(false);
const src = computed(() => faviconURL(props.url, props.proxy));
watch(src, () => {
	failed.value = false;
});
</script>

<template>
	<span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900">
		<img
			v-if="src && !failed"
			:src="src"
			alt=""
			class="size-3.5 rounded-sm"
			loading="lazy"
			referrerpolicy="no-referrer"
			@error="failed = true"
		/>
		<UIcon v-else name="i-lucide-globe" class="size-3.5 text-slate-500" />
	</span>
</template>
