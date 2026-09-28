<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: "X-Ray" });
</script>

<template>
	<span class="inline-flex items-center gap-2.5">
		<ImgAppIcon class="h-full w-auto" />
		<span class="text-xl leading-none font-bold tracking-tight">{{ name }}</span>
	</span>
</template>
