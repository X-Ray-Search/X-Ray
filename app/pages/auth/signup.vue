<script setup lang="ts">
/**
 * Signup — UI only. The template backend has no registration route; add a
 * `POST /auth/register` (or similar) to the backend, regenerate the API client, and call it in
 * `onSubmit`. Delete this page (and the link on the login page) if your app is invite-only.
 */
import type { AuthFormField, FormError, FormSubmitEvent } from "@nuxt/ui";
import * as z from "zod";

definePageMeta({
	layout: "auth",
});

useSeoMeta({
	title: "Sign Up | ProjectName",
	description: "Create a new account",
});

const toast = useToast();

const fields: AuthFormField[] = [
	{
		name: "username",
		type: "text",
		label: "Username",
		placeholder: "Enter your username",
		required: true,
	},
	{
		name: "email",
		type: "email",
		label: "Email Address",
		placeholder: "Enter your email address",
		required: true,
	},
	{
		name: "password",
		label: "Password",
		type: "password",
		placeholder: "Enter your password",
		required: true,
	},
	{
		name: "confirm_password",
		label: "Confirm Password",
		type: "password",
		placeholder: "Re-enter your password",
		required: true,
	},
];

const schema = z.object({
	username: z
		.string("Username is required")
		.trim()
		.min(5, "Must be at least 5 characters")
		.max(40, "Must be at most 40 characters")
		.regex(/^[a-z0-9._-]+$/, "Only lowercase letters, numbers, dots, dashes and underscores"),
	email: z.email("Invalid email address").trim(),
	password: z
		.string("Password is required")
		.min(8, "Must be at least 8 characters")
		.max(128, "Must be at most 128 characters"),
	confirm_password: z.string("Confirm Password is required").min(1, "Confirm Password is required"),
});

type Schema = z.output<typeof schema>;

function validate(state: Partial<Schema>): FormError[] {
	const errors: FormError[] = [];
	if (state.password && state.confirm_password && state.password !== state.confirm_password) {
		errors.push({ name: "confirm_password", message: "Passwords do not match" });
	}
	return errors;
}

async function onSubmit(_payload: FormSubmitEvent<Schema>) {
	toast.add({
		title: "Coming Soon",
		description: "Signup is not available yet. Contact an admin to create your account.",
		icon: "i-lucide-info",
		color: "warning",
	});
}
</script>

<template>
	<UAuthForm
		:schema="schema"
		:validate="validate"
		title="Sign Up"
		description="Create a new account by filling in the information below."
		icon="i-lucide-user-plus"
		:fields="fields"
		:submit="{ label: 'Sign Up' }"
		@submit="onSubmit"
	>
		<template #footer>
			<div class="text-center text-sm">
				Already have an account?
				<NuxtLink to="/auth/login" class="text-primary hover:underline">Login here</NuxtLink>
			</div>
			<UAlert
				color="warning"
				variant="subtle"
				title="Coming Soon"
				description="Signup is not yet available. Contact an admin to create your account."
				icon="i-lucide-construction"
				class="mt-4"
			/>
		</template>
	</UAuthForm>
</template>
