<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from "@nuxt/ui";
import * as z from "zod";

definePageMeta({
	layout: "auth",
});

useSeoMeta({
	title: "Sign in | X-Ray",
	description: "Sign in to X-Ray",
});

const route = useRoute();
const toast = useToast();
const { signIn } = useSession();

// Only follow internal redirects (`/…`, not `//evil.example`); default to the search home.
const requestedUrl = route.query.url?.toString() ?? "";
const redirectUrl =
	requestedUrl.startsWith("/") && !requestedUrl.startsWith("//") ? requestedUrl : "/";

const fields: AuthFormField[] = [
	{
		name: "username",
		type: "text",
		label: "Username",
		placeholder: "Enter your username",
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
		name: "remember",
		label: "Remember me",
		type: "checkbox",
		description: "Stay signed in for 30 days.",
	},
];

const schema = z.object({
	username: z.string("Username is required").trim().min(1, "Username is required"),
	password: z.string("Password is required").min(1, "Password is required"),
	remember: z.boolean().optional(),
});

type Schema = z.output<typeof schema>;

const loading = ref(false);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
	loading.value = true;

	const result = await useAPI(
		(api) =>
			api.postAuthLogin({
				body: { username: payload.data.username, password: payload.data.password },
			}),
		true,
	);

	if (!result.success) {
		loading.value = false;
		const invalidCredentials = (result.code as number) === 401;
		toast.add({
			title: invalidCredentials ? "Invalid username or password" : "Sign-in failed",
			description: invalidCredentials
				? "Please check your credentials and try again."
				: result.message || "An error occurred during sign-in. Please try again later.",
			icon: "i-lucide-alert-circle",
			color: "error",
		});
		return;
	}

	await signIn(result.data.token, payload.data.remember === true);
	loading.value = false;

	toast.add({ title: "Signed in", icon: "i-lucide-check", color: "success" });
	await navigateTo(redirectUrl);
}
</script>

<template>
	<UAuthForm
		:schema="schema"
		title="Sign in"
		description="Enter your credentials to use this X-Ray instance."
		icon="i-lucide-user"
		:fields="fields"
		:submit="{ label: 'Sign in', loading }"
		@submit="onSubmit"
	>
		<template #footer>
			<div class="text-center text-sm">
				Forgot your password?
				<NuxtLink to="/auth/forgot-password" class="text-primary hover:underline">Reset it</NuxtLink>
			</div>
			<p class="mt-2 text-center text-xs text-slate-500">Accounts are created by the administrator of this instance.</p>
		</template>
	</UAuthForm>
</template>
