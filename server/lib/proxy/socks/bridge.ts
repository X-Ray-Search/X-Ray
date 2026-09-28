import { randomBytes, timingSafeEqual } from "crypto";
import net from "net";
import { Logger } from "../../utils/logger";
import { Socks5Client } from "./socks5Client";

/**
 * Bun's `fetch` supports HTTP(S) proxies but not SOCKS. The bridge closes that gap: a tiny
 * HTTP proxy bound to 127.0.0.1 that tunnels every request through the upstream SOCKS5
 * server. The transport then calls `fetch(url, { proxy: bridge.proxyUrl })`, so TLS,
 * redirects and decompression stay in Bun's native HTTP client.
 *
 * The bridge only accepts requests carrying its random per-instance credentials, so other
 * local processes cannot use it as an open proxy.
 */
export class SocksBridge {
	private server: net.Server | null = null;
	private starting: Promise<void> | null = null;
	private port = 0;
	private readonly secret = randomBytes(24).toString("hex");
	private readonly expectedAuth = Buffer.from(
		`Basic ${Buffer.from(`xray:${this.secret}`).toString("base64")}`,
	);
	private readonly sockets = new Set<net.Socket>();

	constructor(private readonly upstream: SocksBridge.Upstream) {}

	async getProxyUrl(): Promise<string> {
		await this.ensureStarted();
		return `http://xray:${this.secret}@127.0.0.1:${this.port}`;
	}

	private ensureStarted(): Promise<void> {
		if (this.server) return Promise.resolve();
		this.starting ??= new Promise<void>((resolve, reject) => {
			const server = net.createServer((client) => this.handleClient(client));
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				this.port = (server.address() as net.AddressInfo).port;
				// Never keep the process alive just for the bridge.
				server.unref();
				this.server = server;
				resolve();
			});
		}).finally(() => {
			this.starting = null;
		});
		return this.starting;
	}

	async close() {
		for (const socket of this.sockets) socket.destroy();
		this.sockets.clear();
		const server = this.server;
		this.server = null;
		if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
	}

	private track(socket: net.Socket) {
		this.sockets.add(socket);
		socket.once("close", () => this.sockets.delete(socket));
		socket.on("error", () => socket.destroy());
	}

	private handleClient(client: net.Socket) {
		this.track(client);
		let head = Buffer.alloc(0);

		const onData = (chunk: Buffer) => {
			head = Buffer.concat([head, chunk]);
			const end = head.indexOf("\r\n\r\n");
			if (end === -1) {
				if (head.length > SocksBridge.MAX_HEADER_BYTES) {
					client.end("HTTP/1.1 431 Request Header Fields Too Large\r\n\r\n");
				}
				return;
			}
			client.off("data", onData);
			client.pause();
			const headerText = head.subarray(0, end).toString("latin1");
			const rest = head.subarray(end + 4);
			this.handleRequest(client, headerText, rest).catch((err) => {
				const message = (err as Error).message;
				Logger.debug("SOCKS bridge request failed:", message);
				// Tagged so the transport can tell tunnel failures from upstream 502s.
				if (!client.destroyed) {
					client.end(
						`HTTP/1.1 502 Bad Gateway\r\n${SocksBridge.ERROR_HEADER}: ${encodeURIComponent(message)}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
					);
				}
			});
		};
		client.on("data", onData);
	}

	private async handleRequest(client: net.Socket, headerText: string, rest: Buffer) {
		const [requestLine = "", ...headerLines] = headerText.split("\r\n");
		const authHeader = headerLines
			.find((line) => line.toLowerCase().startsWith("proxy-authorization:"))
			?.slice("proxy-authorization:".length)
			.trim();

		if (!authHeader || !this.checkAuth(authHeader)) {
			client.end(
				'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="xray"\r\nConnection: close\r\n\r\n',
			);
			return;
		}

		const [method = "", target = "", version = "HTTP/1.1"] = requestLine.split(" ");

		if (method.toUpperCase() === "CONNECT") {
			const { host, port } = SocksBridge.parseHostPort(target, 443);
			const upstream = await this.openTunnel(host, port);
			client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			if (rest.length) upstream.write(rest);
			this.pipe(client, upstream);
			return;
		}

		// Plain HTTP: absolute-form request line (`GET http://host/path HTTP/1.1`).
		let url: URL;
		try {
			url = new URL(target);
		} catch {
			client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
			return;
		}
		if (url.protocol !== "http:") {
			client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
			return;
		}

		const upstream = await this.openTunnel(url.hostname, Number(url.port || 80));
		const forwardedHeaders = headerLines.filter((line) => {
			const name = line.split(":")[0]?.trim().toLowerCase();
			return name !== "proxy-authorization" && name !== "proxy-connection" && name !== "connection";
		});
		// One request per tunnel keeps the bridge stateless.
		forwardedHeaders.push("Connection: close");
		upstream.write(
			`${method} ${url.pathname}${url.search} ${version}\r\n${forwardedHeaders.join("\r\n")}\r\n\r\n`,
		);
		if (rest.length) upstream.write(rest);
		this.pipe(client, upstream);
	}

	private async openTunnel(host: string, port: number) {
		const socket = await Socks5Client.connect({
			proxyHost: this.upstream.host,
			proxyPort: this.upstream.port,
			username: this.upstream.username,
			password: this.upstream.password,
			remoteDns: this.upstream.remoteDns,
			targetHost: host,
			targetPort: port,
		});
		this.track(socket);
		return socket;
	}

	private pipe(client: net.Socket, upstream: net.Socket) {
		client.pipe(upstream);
		upstream.pipe(client);
		client.once("close", () => upstream.destroy());
		upstream.once("close", () => client.destroy());
		client.resume();
		upstream.resume();
	}

	private checkAuth(header: string) {
		const actual = Buffer.from(header);
		return actual.length === this.expectedAuth.length && timingSafeEqual(actual, this.expectedAuth);
	}

	static parseHostPort(target: string, defaultPort: number) {
		const bracketed = target.match(/^\[([^\]]+)\](?::(\d+))?$/);
		if (bracketed) return { host: bracketed[1]!, port: Number(bracketed[2] ?? defaultPort) };
		const index = target.lastIndexOf(":");
		if (index === -1) return { host: target, port: defaultPort };
		return { host: target.slice(0, index), port: Number(target.slice(index + 1)) || defaultPort };
	}
}

export namespace SocksBridge {
	export const MAX_HEADER_BYTES = 64 * 1024;

	/** Marks 502s produced by the bridge itself (the SOCKS tunnel could not be opened). */
	export const ERROR_HEADER = "X-Xray-Bridge-Error";

	export interface Upstream {
		host: string;
		port: number;
		username?: string;
		password?: string;
		remoteDns?: boolean;
	}
}
