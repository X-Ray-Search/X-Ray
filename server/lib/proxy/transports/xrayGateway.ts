import { brotliDecompressSync, inflateSync } from "zlib";
import { z } from "zod";
import { ProxyTransport } from "../transport";

const Settings = z.object({
	url: z
		.string()
		.regex(/^https?:\/\/\S+$/, "Use the gateway base URL, e.g. https://gw.example.workers.dev")
		.describe("Base URL of the Simple-HTTP-Proxy-Gateway deployment"),
	token: z.string().min(1).max(1024).describe("The gateway's PROXY_AUTH_TOKEN"),
});

/**
 * X-Ray Simple-HTTP-Proxy-Gateway (https://git.leicraftmc.de/X-Ray-Search/Simple-HTTP-Proxy-Gateway),
 * deployable on Bun or Cloudflare Workers. Uses its JSON-RPC mode: `POST /v1/fetch` with the
 * request description, authenticated as `x-ray:<token>` (HTTP Basic).
 *
 * The gateway passes the upstream response through as-is. Depending on the runtime the body may
 * already be decoded while `content-encoding` is still set, so we fetch the gateway without
 * automatic decompression, ask the target for `identity`, and decode by inspecting the bytes.
 */
export class XRayGatewayTransport extends ProxyTransport<z.infer<typeof Settings>> {
	static readonly definition = ProxyTransport.define({
		type: "xray_gateway",
		name: "X-Ray HTTP proxy gateway",
		description:
			"A Simple-HTTP-Proxy-Gateway instance (Bun or Cloudflare Workers) — great for rotating exit IPs.",
		settings: Settings,
		secretFields: ["token"],
	});

	private get endpoint() {
		return `${this.settings.url.replace(/\/+$/, "")}/v1/fetch`;
	}

	private get authorization() {
		return `Basic ${Buffer.from(`x-ray:${this.settings.token}`).toString("base64")}`;
	}

	async fetch(url: string, request: ProxyTransport.Request = {}) {
		const body =
			request.body === undefined
				? undefined
				: typeof request.body === "string"
					? { body: request.body, bodyEncoding: "text" as const }
					: { body: Buffer.from(request.body).toString("base64"), bodyEncoding: "base64" as const };

		const res = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				Authorization: this.authorization,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url,
				returnFormat: "raw",
				init: {
					method: request.method ?? "GET",
					headers: { ...request.headers, "Accept-Encoding": "identity" },
					redirect: request.redirect ?? "follow",
					...body,
				},
			}),
			signal: request.signal,
			decompress: false,
		});

		if (res.status === 407) {
			throw new Error("X-Ray gateway rejected the credentials (407)");
		}

		const raw = new Uint8Array(await res.arrayBuffer());
		const headers = new Headers(res.headers);
		const decoded = XRayGatewayTransport.decode(raw, headers.get("content-encoding"));
		headers.delete("content-encoding");
		headers.delete("content-length");

		return new Response(decoded, { status: res.status, statusText: res.statusText, headers });
	}

	/** Decode a body whose `content-encoding` header may or may not describe its bytes. */
	static decode(body: Uint8Array<ArrayBuffer>, encoding: string | null): Uint8Array<ArrayBuffer> {
		const kind = encoding?.toLowerCase().trim();
		if (!kind || kind === "identity" || body.length === 0) return body;
		try {
			if (kind.includes("gzip") && body[0] === 0x1f && body[1] === 0x8b) {
				return Bun.gunzipSync(body) as Uint8Array<ArrayBuffer>;
			}
			if (
				kind.includes("zstd") &&
				body[0] === 0x28 &&
				body[1] === 0xb5 &&
				body[2] === 0x2f &&
				body[3] === 0xfd
			) {
				return Bun.zstdDecompressSync(body) as Uint8Array<ArrayBuffer>;
			}
			if (kind.includes("br")) return new Uint8Array(brotliDecompressSync(body));
			if (kind.includes("deflate")) return new Uint8Array(inflateSync(body));
		} catch {
			// Not actually encoded — the gateway runtime already decoded it.
		}
		return body;
	}
}
