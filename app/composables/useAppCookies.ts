/**
 * useAppCookies — typed session-cookie accessor.
 *
 * `AppCookie` wraps `useCookie` so callers do `useAppCookies().sessionToken.get().value` /
 * `.set(value, options?)`. The cookie name matches the backend's key prefix (`xray_`). The session
 * cookie defaults to `sameSite=lax; httpOnly=false` so the client can read it to feed
 * `updateAPIClient` (see docs/10-auth.md#frontend-session-handling).
 *
 * `secure` follows the page protocol: self-hosted instances are often reached over plain HTTP on
 * a LAN address, where browsers silently drop `secure` cookies and login would never stick.
 */
import type { CookieOptions } from "#app";

type CookieOptionsWithoutReadonly<T> = CookieOptions<T> & {
	readonly?: false;
};

function sessionCookieOptions(): CookieOptionsWithoutReadonly<string | null> {
	return {
		path: "/",
		secure: import.meta.client ? window.location.protocol === "https:" : true,
		sameSite: "lax",
		httpOnly: false, // the client must read the token to attach it to the SDK
	};
}

class AppCookie<T extends string | null | undefined> {
	constructor(
		protected readonly name: string,
		protected readonly options?: () => CookieOptionsWithoutReadonly<T>,
	) {}

	get() {
		return useCookie(this.name);
	}

	set(value: T, options?: CookieOptionsWithoutReadonly<T>) {
		const merged = { ...this.options?.(), ...options } as CookieOptionsWithoutReadonly<T> | undefined;
		useCookie(this.name, merged).value = value;
	}
}

export function useAppCookies() {
	return {
		// Must match the backend key prefix (`xray_sess_…`).
		sessionToken: new AppCookie<string | null>("xray_session_token", sessionCookieOptions as any),
	} as const;
}
