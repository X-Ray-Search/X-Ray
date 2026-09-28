/**
 * auth.global.ts — session-aware route guard.
 *
 * - `/auth/*` is for signed-out users; a valid session is sent on to `HOME_ROUTE`.
 * - `PROTECTED_PREFIXES` need a valid session, otherwise → `/auth/login?url=…`.
 * - On a private instance (`search_access: "authenticated"`) every other page needs one too, so
 *   signed-out visitors land on the login page right away. On a public instance `/` and `/search`
 *   are open to everyone (the API still enforces access and rate limits).
 * - `ADMIN_PREFIXES` additionally need `role === "admin"`, otherwise → `/dashboard`.
 *
 * See docs/10-auth.md.
 */
import { useInstanceStore } from "~/composables/stores/useInstanceStore";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const HOME_ROUTE = "/";
const PROTECTED_PREFIXES = ["/dashboard", "/ai"];
const ADMIN_PREFIXES = ["/dashboard/admin"];
const PUBLIC_ROUTES: string[] = [];

function hasPrefix(path: string, prefixes: string[]) {
	return prefixes.some(
		(prefix) => prefix === "/" || path === prefix || path.startsWith(`${prefix}/`),
	);
}

/** Unknown (instance info unavailable) counts as private. */
async function isPrivateInstance() {
	const instance = await useInstanceStore().use();
	return instance.value?.search_access !== "public";
}

export default defineNuxtRouteMiddleware(async (to) => {
	const sessionToken = useAppCookies().sessionToken;
	const token = sessionToken.get().value;
	const store = useUserInfoStore();

	if (hasPrefix(to.path, ["/auth"])) {
		if (!token) return;
		if (store.isValid(await store.use())) return navigateTo(HOME_ROUTE);

		// Token exists but is invalid or expired: clear it and stay on the auth page.
		sessionToken.set(null);
		return;
	}

	if (SimpleRouteMatcher.match(to.path, PUBLIC_ROUTES)) return;
	if (!hasPrefix(to.path, PROTECTED_PREFIXES) && !(await isPrivateInstance())) return;

	const loginRoute = `/auth/login?url=${encodeURIComponent(to.fullPath)}`;
	if (!token) return navigateTo(loginRoute);

	const user = await store.use();
	if (!store.isValid(user)) {
		sessionToken.set(null);
		return navigateTo(loginRoute);
	}

	if (hasPrefix(to.path, ADMIN_PREFIXES) && user.value.role !== "admin") {
		return navigateTo("/dashboard");
	}
});
