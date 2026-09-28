/**
 * useSession — sign-in state helpers shared by the login page and every account menu. After login
 * or logout the per-user stores are reset and the instance info is refetched, because
 * `can_search` and the effective search preferences depend on the session.
 */
import { useInstanceStore } from "./stores/useInstanceStore";
import { useSearchPreferencesStore } from "./stores/useSearchPreferencesStore";
import { useUserInfoStore } from "./stores/useUserStore";

export function useSession() {
	async function refreshSessionState() {
		await useSearchPreferencesStore().clear();
		await Promise.all([useUserInfoStore().refresh(), useInstanceStore().refresh()]);
	}

	/** Store a fresh session token (after login) and reload the per-user state. */
	async function signIn(token: string, remember: boolean) {
		updateAPIClient(token);
		useAppCookies().sessionToken.set(token, {
			maxAge: remember ? 60 * 60 * 24 * 30 : undefined, // 30 days only with "remember me"
		});
		await refreshSessionState();
	}

	/** Invalidate the session on the server (best effort) and clear all local state. */
	async function signOut() {
		const result = await useAPI((api) => api.postAuthLogout({}), true);
		useAppCookies().sessionToken.set(null);
		updateAPIClient(null);
		await useUserInfoStore().clear();
		await refreshSessionState();
		return result.success;
	}

	return { signIn, signOut, refreshSessionState };
}
