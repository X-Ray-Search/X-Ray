<script setup lang="ts">
/**
 * Form generated from a JSON Schema (the settings schema of an engine or proxy type), so new
 * engine and proxy classes get a settings UI without frontend changes. Secret fields render as
 * password inputs; left empty they keep their stored value.
 */
interface PropertySchema {
	type?: string | string[];
	enum?: unknown[];
	default?: unknown;
	description?: string;
	minimum?: number;
	maximum?: number;
	pattern?: string;
	items?: PropertySchema;
	anyOf?: PropertySchema[];
}

const props = withDefaults(
	defineProps<{
		schema: Record<string, any>;
		secretFields?: string[];
		/** Secret fields that already have a stored value. */
		secretsSet?: string[];
	}>(),
	{ secretFields: () => [], secretsSet: () => [] },
);

const values = defineModel<Record<string, any>>({ required: true });

const properties = computed(() =>
	Object.entries((props.schema.properties ?? {}) as Record<string, PropertySchema>).map(
		([key, schema]) => {
			const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
			const kind = schema.enum
				? "enum"
				: type === "boolean"
					? "boolean"
					: type === "number" || type === "integer"
						? "number"
						: type === "string"
							? "string"
							: "json";
			return {
				key,
				schema,
				kind,
				required: (props.schema.required ?? []).includes(key) && schema.default === undefined,
			};
		},
	),
);

function label(key: string) {
	const text = key.replace(/_/g, " ");
	return (
		text.charAt(0).toUpperCase() +
		text.slice(1).replace(/\b(url|api|dns|ip)\b/gi, (m) => m.toUpperCase())
	);
}

function update(key: string, value: unknown) {
	values.value = { ...values.value, [key]: value };
}

function jsonValue(key: string) {
	return JSON.stringify(values.value[key] ?? null, null, 2);
}

function updateJSON(key: string, text: string) {
	try {
		update(key, JSON.parse(text));
	} catch {
		// Keep the last valid value while the user is typing.
	}
}
</script>

<template>
	<div class="space-y-4">
		<p v-if="!properties.length" class="text-sm text-slate-500">This type has no settings.</p>

		<UFormField
			v-for="field in properties"
			:key="field.key"
			:label="label(field.key)"
			:description="field.schema.description"
			:required="field.required"
		>
			<USwitch
				v-if="field.kind === 'boolean'"
				:model-value="values[field.key] ?? field.schema.default ?? false"
				@update:model-value="update(field.key, $event)"
			/>

			<USelect
				v-else-if="field.kind === 'enum'"
				:model-value="values[field.key] ?? field.schema.default"
				:items="(field.schema.enum ?? []).map((v) => ({ label: String(v), value: v }))"
				class="w-full"
				@update:model-value="update(field.key, $event)"
			/>

			<UInputNumber
				v-else-if="field.kind === 'number'"
				:model-value="values[field.key] ?? field.schema.default"
				:min="field.schema.minimum"
				:max="field.schema.maximum"
				class="w-full"
				@update:model-value="update(field.key, $event)"
			/>

			<UInput
				v-else-if="field.kind === 'string'"
				:model-value="values[field.key] ?? ''"
				:type="secretFields.includes(field.key) ? 'password' : 'text'"
				:placeholder="
					secretFields.includes(field.key) && secretsSet.includes(field.key)
						? '•••••••• (stored — leave empty to keep)'
						: String(field.schema.default ?? '')
				"
				autocomplete="off"
				class="w-full"
				@update:model-value="update(field.key, $event)"
			/>

			<UTextarea
				v-else
				:model-value="jsonValue(field.key)"
				:rows="4"
				autoresize
				class="w-full font-mono text-xs"
				@update:model-value="updateJSON(field.key, String($event))"
			/>
		</UFormField>
	</div>
</template>
