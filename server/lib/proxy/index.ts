import { DB } from "../db";
import { SettingsHandler } from "../settings";
import { Logger } from "../utils/logger";
import { ProxyTransport } from "./transport";
import { DirectTransport } from "./transports/direct";
import { ProxyTransportRegistry } from "./transports";

/**
 * Owns the live proxy transports (one per enabled `proxies` row) and routes outbound requests.
 *
 * Resolution order for a request: the explicit proxy list (e.g. an engine's `proxy_ids`) →
 * the instance's `default_proxy_ids` → direct. Within a list, requests rotate round-robin and
 * fail over to the next proxy on network errors. If a list is configured but none of its
 * proxies is available, the request fails instead of silently leaking the server IP.
 */
export class ProxyManager {
	private static transports = new Map<number, ProxyTransport>();
	private static loading: Promise<void> | null = null;
	private static loaded = false;
	private static readonly rotation = new Map<string, number>();
	private static readonly direct = new DirectTransport(0, "Direct", {});

	/** (Re)load transports from the DB. Call after any proxy change. */
	static async reload() {
		const rows = await DB.instance().select().from(DB.Tables.proxies).all();
		const next = new Map<number, ProxyTransport>();

		for (const row of rows) {
			if (!row.enabled) continue;
			try {
				next.set(row.id, this.instantiate(row));
			} catch (err) {
				Logger.warn(`Proxy '${row.name}' (#${row.id}) is invalid and was skipped:`, (err as Error).message);
			}
		}

		const previous = this.transports;
		this.transports = next;
		this.loaded = true;
		await Promise.allSettled([...previous.values()].map((t) => t.close()));
	}

	private static async ensureLoaded() {
		if (this.loaded) return;
		this.loading ??= this.reload().finally(() => {
			this.loading = null;
		});
		await this.loading;
	}

	/** Build a transport for a row (also used to test proxies that are disabled or unsaved). */
	static instantiate(row: Pick<DB.Models.Proxy, "id" | "name" | "proxy_type" | "settings">) {
		const cls = ProxyTransportRegistry.get(row.proxy_type);
		if (!cls) throw new Error(`Unknown proxy type '${row.proxy_type}'`);
		const settings = cls.definition.settings.parse(row.settings ?? {});
		return new cls(row.id, row.name, settings);
	}

	/** The transports a request with this proxy list would rotate through. */
	static async resolve(proxyIds: readonly number[] = []): Promise<ProxyTransport[]> {
		await this.ensureLoaded();

		const ids = proxyIds.length
			? proxyIds
			: (await SettingsHandler.getInstance()).default_proxy_ids;
		if (!ids.length) return [this.direct];

		const chain = ids
			.map((id) => this.transports.get(id))
			.filter((t): t is ProxyTransport => t !== undefined);

		if (!chain.length) {
			throw new ProxyManager.NoProxyAvailableError(
				`None of the configured proxies (#${ids.join(", #")}) is enabled`,
			);
		}
		return chain;
	}

	static async fetch(
		url: string,
		request: ProxyTransport.Request = {},
		options: { proxyIds?: readonly number[] } = {},
	): Promise<Response> {
		const chain = await this.resolve(options.proxyIds);
		const key = chain.map((t) => t.id).join(",");
		const start = this.rotation.get(key) ?? 0;
		this.rotation.set(key, (start + 1) % chain.length);

		let lastError: unknown;
		for (let attempt = 0; attempt < chain.length; attempt++) {
			const transport = chain[(start + attempt) % chain.length]!;
			try {
				return await transport.fetch(url, request);
			} catch (err) {
				// A timeout/abort is the caller's decision — don't burn the other proxies on it.
				if (request.signal?.aborted) throw err;
				lastError = err;
				Logger.debug(`Proxy '${transport.name}' failed for ${new URL(url).host}:`, (err as Error).message);
			}
		}
		throw lastError;
	}

	static async closeAll() {
		await Promise.allSettled([...this.transports.values()].map((t) => t.close()));
		this.transports.clear();
		this.loaded = false;
	}

	/** Settings as exposed by the API: secret fields are blanked, `secrets_set` lists filled ones. */
	static toPublicSettings(proxyType: string, settings: Record<string, any>) {
		const secretFields = ProxyTransportRegistry.get(proxyType)?.definition.secretFields ?? [];
		const publicSettings = { ...settings };
		const secretsSet: string[] = [];
		for (const field of secretFields) {
			if (publicSettings[field]) secretsSet.push(field);
			delete publicSettings[field];
		}
		return { settings: publicSettings, secrets_set: secretsSet };
	}
}

export namespace ProxyManager {
	export class NoProxyAvailableError extends Error {}
}
