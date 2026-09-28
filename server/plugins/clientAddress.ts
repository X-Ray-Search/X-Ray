import { defineNitroPlugin } from "nitropack/runtime";

/**
 * Makes the client address available as `event.context.clientAddress` (read by h3's
 * `getRequestIP`, and from there by `server/routes/api/[...].ts`).
 *
 * In production the address comes from `server/runtime/bun-entry.ts`; in `nuxt dev` from the
 * socket. SSR calls to `/api/**` pass it on as platform context (see
 * `app/composables/updateAPIClient.ts`). Clients cannot set any of this.
 */
export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("request", (event) => {
		const address = event.context.clientAddress || event.node.req.socket?.remoteAddress;
		if (!address) return;
		event.context.clientAddress = address;
		if (!event.context._platform?.clientAddress) {
			event.context._platform = { ...event.context._platform, clientAddress: address };
		}
	});
});
