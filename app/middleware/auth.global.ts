/**
 * auth.global.ts — session-aware route guard.
 *
 * - `/auth/*` is for signed-out users; a valid session is sent on to `HOME_ROUTE`.
 * - `PROTECTED_PREFIXES` need a valid session, otherwise → `/auth/login?url=…`.
 * - `ADMIN_PREFIXES` additionally need `role === "admin"`, otherwise → `/dashboard`.
 * - `/` and `/search` are public routes: whether a visitor may *search* is an instance setting
 *   (`search_access`), enforced by the API; those pages show a sign-in prompt when needed.
 *
 * See docs/10-auth.md.
 */
import { useUserInfoStore } from "~/composables/stores/useUserStore";

const HOME_ROUTE = "/";
const PROTECTED_PREFIXES = ["/dashboard"];
const ADMIN_PREFIXES = ["/dashboard/admin"];
const PUBLIC_ROUTES: string[] = [];

function hasPrefix(path: string, prefixes: string[]) {
	return prefixes.some(
		(prefix) => prefix === "/" || path === prefix || path.startsWith(`${prefix}/`),
	);
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

	if (!hasPrefix(to.path, PROTECTED_PREFIXES)) return;
	if (SimpleRouteMatcher.match(to.path, PUBLIC_ROUTES)) return;

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
