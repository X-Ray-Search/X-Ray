import { z } from "zod";

/**
 * Base class of every outbound proxy type. A transport turns an outbound request into a
 * `Response`, however it gets there (direct, HTTP proxy, SOCKS5, X-Ray gateway, …).
 *
 * To add a proxy type: subclass `ProxyTransport`, give it a static `definition` built with
 * `ProxyTransport.define(...)`, implement `fetch`, and register the class in
 * `proxy/transports/index.ts`.
 */
export abstract class ProxyTransport<Settings extends Record<string, any> = Record<string, any>> {
	constructor(
		readonly id: number,
		readonly name: string,
		protected readonly settings: Settings,
	) {}

	abstract fetch(url: string, request?: ProxyTransport.Request): Promise<Response>;

	/** Release resources (sockets, local servers). Called when the proxy config changes. */
	async close(): Promise<void> {}

	/**
	 * Fetch a page that echoes the caller IP and report latency + the exit IP. Transports may
	 * override this if they need a different probe.
	 */
	async test(timeoutMs = 10_000): Promise<ProxyTransport.TestResult> {
		const started = performance.now();
		try {
			const res = await this.fetch(ProxyTransport.TEST_URL, {
				signal: AbortSignal.timeout(timeoutMs),
				headers: { Accept: "text/plain" },
			});
			const body = await res.text();
			const latency = Math.round(performance.now() - started);
			if (!res.ok) {
				return {
					ok: false,
					latency_ms: latency,
					status: res.status,
					ip: null,
					error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
				};
			}
			const ip = body.match(/^ip=(.+)$/m)?.[1]?.trim() ?? null;
			return { ok: true, latency_ms: latency, status: res.status, ip, error: null };
		} catch (err) {
			return {
				ok: false,
				latency_ms: Math.round(performance.now() - started),
				status: null,
				ip: null,
				error: (err as Error).message,
			};
		}
	}

	static define<S extends z.ZodObject>(definition: ProxyTransport.Definition<S>) {
		return definition;
	}
}

export namespace ProxyTransport {
	export const TEST_URL = "https://www.cloudflare.com/cdn-cgi/trace";

	export interface Request {
		method?: string;
		headers?: Record<string, string>;
		body?: string | Uint8Array;
		redirect?: "follow" | "manual" | "error";
		signal?: AbortSignal;
	}

	export interface Definition<S extends z.ZodObject = z.ZodObject> {
		/** Registry key stored in `proxies.proxy_type`. */
		readonly type: string;
		readonly name: string;
		readonly description: string;
		readonly settings: S;
		/** Settings keys that hold secrets — never returned by the API. */
		readonly secretFields?: readonly string[];
	}

	export interface Class<S extends z.ZodObject = z.ZodObject> {
		new (id: number, name: string, settings: z.infer<S>): ProxyTransport;
		readonly definition: Definition<S>;
	}

	export const TestResult = z.object({
		ok: z.boolean(),
		latency_ms: z.number(),
		status: z.number().nullable(),
		ip: z.string().nullable().describe("Exit IP as seen by the test endpoint"),
		error: z.string().nullable(),
	});
	export type TestResult = z.infer<typeof TestResult>;
}
