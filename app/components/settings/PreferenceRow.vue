<script setup lang="ts">
/** One labelled setting. In `user` mode it shows whether the value overrides the instance default. */
defineProps<{
	label: string;
	description?: string;
	mode: "user" | "admin";
	overridden?: boolean;
	defaultLabel?: string;
}>();
defineEmits<{ reset: [] }>();
</script>

<template>
	<div class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
		<div class="min-w-0 sm:max-w-md">
			<div class="flex flex-wrap items-center gap-2">
				<p class="font-medium text-white">{{ label }}</p>
				<template v-if="mode === 'user'">
					<UBadge v-if="overridden" label="Custom" size="sm" variant="subtle" color="primary" />
					<span v-else class="text-xs text-slate-500">Instance default</span>
				</template>
			</div>
			<p v-if="description" class="mt-0.5 text-sm text-slate-400">{{ description }}</p>
			<button
				v-if="mode === 'user' && overridden"
				type="button"
				class="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
				@click="$emit('reset')"
			>
				<UIcon name="i-lucide-rotate-ccw" class="size-3" />
				Use instance default<span v-if="defaultLabel"> ({{ defaultLabel }})</span>
			</button>
		</div>
		<div class="shrink-0 sm:min-w-56 sm:text-right">
			<slot />
		</div>
	</div>
</template>
