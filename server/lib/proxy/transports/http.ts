import { z } from "zod";
import { ProxyTransport } from "../transport";

const Settings = z.object({
	url: z
		.string()
		.regex(/^https?:\/\/[^\s/]+(:\d+)?\/?$/, "Use http(s)://host:port")
		.describe("Proxy URL, e.g. http://10.0.0.5:3128"),
	username: z.string().max(256).default(""),
	password: z.string().max(256).default(""),
});

/** Classic HTTP/HTTPS forward proxy (CONNECT for https targets) — handled natively by Bun. */
export class HttpProxyTransport extends ProxyTransport<z.infer<typeof Settings>> {
	static readonly definition = ProxyTransport.define({
		type: "http",
		name: "HTTP(S) proxy",
		description: "A standard HTTP or HTTPS forward proxy (Squid, Tinyproxy, commercial proxies…).",
		settings: Settings,
		secretFields: ["password"],
	});

	private get proxyUrl() {
		const url = new URL(this.settings.url);
		if (this.settings.username) {
			url.username = encodeURIComponent(this.settings.username);
			url.password = encodeURIComponent(this.settings.password);
		}
		return url.toString().replace(/\/$/, "");
	}

	async fetch(url: string, request: ProxyTransport.Request = {}) {
		return fetch(url, {
			method: request.method ?? "GET",
			headers: request.headers,
			body: request.body,
			redirect: request.redirect ?? "follow",
			signal: request.signal,
			proxy: this.proxyUrl,
		});
	}
}
