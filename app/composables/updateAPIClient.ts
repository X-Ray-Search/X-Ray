/**
 * updateAPIClient — point the generated SDK at the API and attach the bearer token.
 *
 * `ignoreResponseError: true` means the client never throws on non-2xx; the
 * `{ success, code, message, data }` envelope is always returned and callers branch on
 * `result.success`. See docs/05-api-contract.md and docs/07-state-and-data.md.
 *
 * X-Ray is same-origin, so the base URL is relative (`/api/v1`): it works under whatever host the
 * instance is opened with, and on the server Nitro's `$fetch` serves the call in-process (no
 * network hop back to the public URL).
 */
import { client } from "@/api-client/client.gen";

export const API_BASE_URL = "/api/v1";

/** Client headers the API may use to identify the visitor (only trusted with XRAY_TRUST_PROXY). */
const FORWARDED_HEADERS = ["x-forwarded-for", "x-real-ip"] as const;

/**
 * Server-side fetch for SSR calls, wrapping Nitro's in-process `$fetch`. Two pitfalls it avoids:
 *
 * - The SDK passes its own options (incl. `url: "/instance"`, the path *without* the base) to
 *   `$fetch`. Over the network that key is ignored, but Nitro's in-process fetch builds the mock
 *   request as `{ url: input, ...init }`, so `init.url` would replace the real URL — the call
 *   would render the page `/instance` (and recurse). SDK-only keys are dropped here.
 * - `useRequestFetch()` is not used: h3's `fetchWithEvent` spreads `init.headers`, which drops
 *   the `Headers` instance the SDK passes, and with it the bearer token.
 *
 * The visitor's address is handed over as platform context (server/plugins/clientAddress.ts).
 */
function serverFetch(): typeof $fetch {
	const event = useRequestEvent();
	const forwarded = useRequestHeaders([...FORWARDED_HEADERS]);
	const clientAddress: string | undefined = event?.context.clientAddress;

	return ((request: Parameters<typeof $fetch>[0], options: Parameters<typeof $fetch>[1] = {}) => {
		const { url: _url, path: _path, ...fetchOptions } = options as Record<string, unknown>;
		const headers = new Headers(options.headers as HeadersInit | undefined);
		for (const name of FORWARDED_HEADERS) {
			const value = forwarded[name];
			if (value && !headers.has(name)) headers.set(name, value);
		}
		return globalThis.$fetch(request, {
			...fetchOptions,
			headers,
			// Read by Nitro as the request's platform context → `getRequestIP` in the API route.
			...(clientAddress ? { context: { _platform: { clientAddress } } } : {}),
		} as typeof options);
	}) as typeof $fetch;
}

export function updateAPIClient(token: string | null) {
	client.setConfig({
		baseURL: API_BASE_URL,
		// `setConfig` merges headers: `undefined` would keep the previous token, only `null`
		// removes it. On the server the client is shared by all requests, so this matters.
		headers: { Authorization: token ? `Bearer ${token}` : (null as unknown as string) },
		ignoreResponseError: true,
		...(import.meta.server ? { $fetch: serverFetch() } : {}),
	});
}
