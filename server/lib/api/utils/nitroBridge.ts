import {
	getMethod,
	getRequestIP,
	getRequestURL,
	type H3Event,
	readRawBody,
	setResponseStatus,
} from "h3";
import { Hono } from "hono";
import { API } from "..";
import { RequestInfo } from "./requestInfo";

/** Hands Nitro requests to the Hono app (mounted at `/api`). See docs/04-backend-hono.md. */
export class NitroBridge {
	private static wrapper: Hono | null = null;

	// Only cache the wrapper once `API.getApp()` succeeds. A request that arrives while
	// `server/plugins/startup.ts` is still running `API.init()` must not cache an empty router.
	private static getWrapper(): Hono | null {
		if (NitroBridge.wrapper) return NitroBridge.wrapper;
		try {
			const app = new Hono();
			app.route("/api", API.getApp());
			NitroBridge.wrapper = app;
			return NitroBridge.wrapper;
		} catch {
			return null;
		}
	}

	/**
	 * Forward `event` to the Hono app. Pass `url` and `method` to serve a different API route
	 * (root-level aliases such as `/autocompleter`); the body is only forwarded for non-GET/HEAD.
	 */
	static async forward(event: H3Event, url = getRequestURL(event), method = getMethod(event)) {
		const app = NitroBridge.getWrapper();
		if (!app) {
			setResponseStatus(event, 503);
			return {
				success: false,
				code: 503,
				message: "API is starting, please retry shortly",
				data: null,
			};
		}

		// Rebuilding the Request loses the socket address, so pass it along in an internal header.
		// Any client-supplied value is dropped first so it cannot be spoofed.
		const headers = new Headers(event.headers);
		headers.delete(RequestInfo.CLIENT_IP_HEADER);
		const socketIP = getRequestIP(event);
		if (socketIP) headers.set(RequestInfo.CLIENT_IP_HEADER, socketIP);

		const hasBody = method !== "GET" && method !== "HEAD";
		if (!hasBody) {
			for (const name of ["content-length", "content-type", "transfer-encoding"]) headers.delete(name);
		}

		const request = new Request(url, {
			method,
			headers,
			body: hasBody
				? ((await readRawBody(event, false)) as Uint8Array<ArrayBuffer> | undefined)
				: undefined,
		});

		return app.fetch(request);
	}
}
