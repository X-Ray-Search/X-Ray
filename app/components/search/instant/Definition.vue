<script setup lang="ts">
defineProps<{ data: Record<string, any> }>();
</script>

<template>
	<div class="space-y-4">
		<p class="text-3xl font-semibold text-white">{{ data.word }}</p>
		<div v-for="meaning in data.meanings" :key="meaning.part_of_speech" class="space-y-1.5">
			<p class="text-sm font-medium text-primary italic">{{ meaning.part_of_speech }}</p>
			<ol class="list-decimal space-y-1.5 pl-5 text-slate-200">
				<li v-for="(definition, index) in meaning.definitions" :key="index">
					{{ definition.definition }}
					<p v-if="definition.example" class="mt-0.5 text-sm text-slate-500">“{{ definition.example }}”</p>
				</li>
			</ol>
		</div>
	</div>
</template>
