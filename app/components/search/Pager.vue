<script setup lang="ts">
/** Google-style page navigation for list categories (pages are part of the URL). */
const props = defineProps<{ page: number; hasMore: boolean; maxPage?: number }>();
defineEmits<{ go: [page: number] }>();

const pages = computed(() => {
	const last = Math.min(props.maxPage ?? 20, props.hasMore ? props.page + 4 : props.page);
	const first = Math.max(1, Math.min(props.page - 4, last - 8));
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
});
</script>

<template>
	<nav class="flex flex-wrap items-center gap-1" aria-label="Pagination">
		<UButton
			v-if="page > 1"
			icon="i-lucide-chevron-left"
			label="Previous"
			color="neutral"
			variant="ghost"
			@click="$emit('go', page - 1)"
		/>
		<UButton
			v-for="n in pages"
			:key="n"
			:label="String(n)"
			:color="n === page ? 'primary' : 'neutral'"
			:variant="n === page ? 'soft' : 'ghost'"
			class="min-w-9 justify-center font-mono"
			:aria-current="n === page ? 'page' : undefined"
			@click="$emit('go', n)"
		/>
		<UButton
			v-if="hasMore"
			trailing-icon="i-lucide-chevron-right"
			label="Next"
			color="neutral"
			variant="ghost"
			@click="$emit('go', page + 1)"
		/>
	</nav>
</template>
