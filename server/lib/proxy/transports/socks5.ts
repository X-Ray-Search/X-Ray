import { z } from "zod";
import { SocksBridge } from "../socks/bridge";
import { ProxyTransport } from "../transport";

const Settings = z.object({
	host: z.string().min(1).max(253),
	port: z.number().int().min(1).max(65535).default(1080),
	username: z.string().max(255).default(""),
	password: z.string().max(255).default(""),
	remote_dns: z
		.boolean()
		.default(true)
		.describe("Resolve hostnames on the proxy (socks5h) to avoid local DNS leaks"),
});

/** SOCKS5 proxy (Tor, SSH -D, WireGuard/VPN gateways, …) via the local {@link SocksBridge}. */
export class Socks5Transport extends ProxyTransport<z.infer<typeof Settings>> {
	static readonly definition = ProxyTransport.define({
		type: "socks5",
		name: "SOCKS5 proxy",
		description: "A SOCKS5 proxy such as Tor (127.0.0.1:9050), `ssh -D` or a VPN container.",
		settings: Settings,
		secretFields: ["password"],
	});

	private readonly bridge = new SocksBridge({
		host: this.settings.host,
		port: this.settings.port,
		username: this.settings.username || undefined,
		password: this.settings.password || undefined,
		remoteDns: this.settings.remote_dns,
	});

	async fetch(url: string, request: ProxyTransport.Request = {}) {
		const res = await fetch(url, {
			method: request.method ?? "GET",
			headers: request.headers,
			body: request.body,
			redirect: request.redirect ?? "follow",
			signal: request.signal,
			proxy: await this.bridge.getProxyUrl(),
		});
		// Surface tunnel failures as errors so the ProxyManager can fail over.
		const bridgeError = res.headers.get(SocksBridge.ERROR_HEADER);
		if (bridgeError) throw new Error(`SOCKS5 proxy failed: ${decodeURIComponent(bridgeError)}`);
		return res;
	}

	override async close() {
		await this.bridge.close();
	}
}
