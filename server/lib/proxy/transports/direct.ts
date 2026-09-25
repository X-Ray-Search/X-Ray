import { z } from "zod";
import { ProxyTransport } from "../transport";

const Settings = z.object({});

/** No proxy — requests leave from the X-Ray host itself. */
export class DirectTransport extends ProxyTransport<z.infer<typeof Settings>> {
	static readonly definition = ProxyTransport.define({
		type: "direct",
		name: "Direct",
		description: "No proxy. Requests are sent from the X-Ray server's own network.",
		settings: Settings,
	});

	async fetch(url: string, request: ProxyTransport.Request = {}) {
		return fetch(url, {
			method: request.method ?? "GET",
			headers: request.headers,
			body: request.body,
			redirect: request.redirect ?? "follow",
			signal: request.signal,
		});
	}
}
