// @ts-nocheck — Nitro runtime entry; the `#nitro-internal-*` virtual modules only exist at build time.
/**
 * Production server entry (replaces Nitro's `bun` preset entry, see `nuxt.config.ts`).
 *
 * Identical to `nitropack/dist/presets/bun/runtime/bun.mjs` except that it hands the client's
 * socket address to Nitro (`context._platform.clientAddress`). The stock entry drops it, which
 * leaves h3's `getRequestIP` empty for every request. X-Ray needs it for per-IP rate limits and
 * the "what is my IP" answer when it is not behind a reverse proxy.
 */
import "#nitro-internal-pollyfills";
import wsAdapter from "crossws/adapters/bun";
import { useNitroApp } from "nitropack/runtime";
import { startScheduleRunner } from "nitropack/runtime/internal";

const nitroApp = useNitroApp();
const ws = import.meta._websocket ? wsAdapter(nitroApp.h3App.websocket) : undefined;

const server = Bun.serve({
	port: process.env.NITRO_PORT || process.env.PORT || 3000,
	hostname: process.env.NITRO_HOST || process.env.HOST,
	idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT) || undefined,
	websocket: import.meta._websocket ? ws.websocket : undefined,
	async fetch(req, bunServer) {
		if (import.meta._websocket && req.headers.get("upgrade") === "websocket") {
			return ws.handleUpgrade(req, bunServer);
		}
		const url = new URL(req.url);
		const body = req.body ? await req.arrayBuffer() : undefined;
		const clientAddress = bunServer.requestIP(req)?.address;

		return nitroApp.localFetch(url.pathname + url.search, {
			host: url.hostname,
			protocol: url.protocol,
			headers: req.headers,
			method: req.method,
			redirect: req.redirect,
			body,
			context: clientAddress ? { _platform: { clientAddress } } : undefined,
		});
	},
});

console.log(`Listening on ${server.url}...`);

if (import.meta._tasks) {
	startScheduleRunner();
}
