import { type HTMLElement, parse as parseHTML } from "node-html-parser";
import { ProxyManager } from "../proxy";
import { EngineError } from "./errors";
import { SearchUtils } from "./utils";

/**
 * HTTP client handed to every engine. Adds browser-like headers, applies the engine timeout,
 * routes through the engine's proxies and turns HTTP failures into typed {@link EngineError}s.
 */
export class EngineHttp {
	private static readonly USER_AGENTS = [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
		"Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:143.0) Gecko/20100101 Firefox/143.0",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
	];

	/** One UA per engine instance and process so cookies/tokens stay consistent. */
	readonly userAgent: string;

	constructor(
		private readonly options: {
			readonly slug: string;
			readonly proxyIds: readonly number[];
			readonly timeoutMs: number;
			readonly signal?: AbortSignal;
		},
	) {
		let hash = 0;
		for (const char of options.slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
		this.userAgent = EngineHttp.USER_AGENTS[hash % EngineHttp.USER_AGENTS.length]!;
	}

	/** A copy bound to an external abort signal (the aggregator's per-search deadline). */
	withSignal(signal: AbortSignal) {
		return new EngineHttp({ ...this.options, signal });
	}

	async request(url: string, init: EngineHttp.RequestInit = {}): Promise<Response> {
		const headers: Record<string, string> = {
			"User-Agent": this.userAgent,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": SearchUtils.acceptLanguage(init.language ?? "all"),
			...init.headers,
		};
		if (init.cookies && Object.keys(init.cookies).length) {
			headers.Cookie = Object.entries(init.cookies)
				.map(([key, value]) => `${key}=${value}`)
				.join("; ");
		}

		let body = init.body;
		if (init.form) {
			body = new URLSearchParams(init.form).toString();
			headers["Content-Type"] = "application/x-www-form-urlencoded";
		}

		const signals = [AbortSignal.timeout(init.timeoutMs ?? this.options.timeoutMs)];
		if (this.options.signal) signals.push(this.options.signal);

		let res: Response;
		try {
			res = await ProxyManager.fetch(
				url,
				{
					method: init.method ?? (body ? "POST" : "GET"),
					headers,
					body,
					redirect: init.redirect ?? "follow",
					signal: AbortSignal.any(signals),
				},
				{ proxyIds: this.options.proxyIds },
			);
		} catch (err) {
			throw EngineError.from(err);
		}

		if (res.status === 429 || res.status === 403) {
			throw new EngineError(
				"blocked",
				`Blocked by ${new URL(url).host} (HTTP ${res.status})`,
				EngineHttp.retryAfterMs(res.headers.get("retry-after")),
			);
		}
		if (!res.ok && !init.acceptStatus?.includes(res.status)) {
			throw new EngineError("http", `HTTP ${res.status} from ${new URL(url).host}`);
		}
		return res;
	}

	async text(url: string, init?: EngineHttp.RequestInit) {
		const res = await this.request(url, init);
		try {
			return await res.text();
		} catch (err) {
			throw EngineError.from(err);
		}
	}

	async json<T = any>(url: string, init?: EngineHttp.RequestInit): Promise<T> {
		const text = await this.text(url, {
			...init,
			headers: { Accept: "application/json, text/javascript, */*; q=0.01", ...init?.headers },
		});
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new EngineError("parse", `Invalid JSON from ${new URL(url).host}`);
		}
	}

	async html(
		url: string,
		init?: EngineHttp.RequestInit,
	): Promise<{ root: HTMLElement; raw: string }> {
		const raw = await this.text(url, init);
		return { root: parseHTML(raw), raw };
	}

	/** Parse a `Retry-After` header (seconds or an HTTP date) into milliseconds. */
	static retryAfterMs(header: string | null, now = Date.now()): number | undefined {
		if (!header) return undefined;
		const seconds = Number(header.trim());
		if (Number.isFinite(seconds)) return seconds > 0 ? seconds * 1000 : undefined;
		const date = Date.parse(header);
		return Number.isNaN(date) || date <= now ? undefined : date - now;
	}
}

export namespace EngineHttp {
	export interface RequestInit {
		method?: string;
		/** `manual` returns 3xx responses as-is (e.g. to read a `Set-Cookie`); list them in `acceptStatus`. */
		redirect?: "follow" | "manual";
		headers?: Record<string, string>;
		cookies?: Record<string, string>;
		body?: string;
		/** Sent as `application/x-www-form-urlencoded`. */
		form?: Record<string, string>;
		/** Locale for the Accept-Language header. */
		language?: string;
		timeoutMs?: number;
		/** Non-2xx statuses that should not throw (e.g. DuckDuckGo's 202). */
		acceptStatus?: number[];
	}
}
