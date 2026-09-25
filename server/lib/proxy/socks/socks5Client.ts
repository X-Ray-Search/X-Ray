import { lookup } from "dns/promises";
import net from "net";

/**
 * Minimal SOCKS5 client (RFC 1928) with username/password auth (RFC 1929). Opens a TCP
 * tunnel to `host:port` through the SOCKS server and resolves with the connected socket.
 */
export class Socks5Client {
	static async connect(options: Socks5Client.Options): Promise<net.Socket> {
		const socket = net.connect(options.proxyPort, options.proxyHost);
		socket.setNoDelay(true);
		const reader = new SocketReader(socket);

		const timeout = setTimeout(
			() => socket.destroy(new Error("SOCKS5 handshake timed out")),
			options.timeoutMs ?? 10_000,
		);

		try {
			await new Promise<void>((resolve, reject) => {
				socket.once("connect", resolve);
				socket.once("error", reject);
			});

			const useAuth = !!options.username;

			// Greeting: offer "no auth" and, when credentials are configured, "username/password".
			socket.write(Buffer.from(useAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
			const [version, method] = await reader.read(2);
			if (version !== 0x05) throw new Error("Not a SOCKS5 server");

			if (method === 0x02) {
				if (!useAuth) throw new Error("SOCKS5 server requires authentication");
				const user = Buffer.from(options.username ?? "");
				const pass = Buffer.from(options.password ?? "");
				socket.write(
					Buffer.concat([
						Buffer.from([0x01, user.length]),
						user,
						Buffer.from([pass.length]),
						pass,
					]),
				);
				const [, status] = await reader.read(2);
				if (status !== 0x00) throw new Error("SOCKS5 authentication failed");
			} else if (method !== 0x00) {
				throw new Error("SOCKS5 server accepted none of the offered auth methods");
			}

			socket.write(await this.buildConnectRequest(options.targetHost, options.targetPort, options));

			const [, reply, , addressType] = await reader.read(4);
			if (reply !== 0x00) {
				throw new Error(`SOCKS5 connect failed: ${Socks5Client.REPLY_MESSAGES[reply!] ?? reply}`);
			}
			// Skip BND.ADDR + BND.PORT.
			if (addressType === 0x01) await reader.read(4 + 2);
			else if (addressType === 0x04) await reader.read(16 + 2);
			else if (addressType === 0x03) {
				const [length] = await reader.read(1);
				await reader.read(length! + 2);
			}

			const leftover = reader.release();
			if (leftover.length) socket.unshift(leftover);
			return socket;
		} catch (err) {
			socket.destroy();
			throw err;
		} finally {
			clearTimeout(timeout);
		}
	}

	private static async buildConnectRequest(
		host: string,
		port: number,
		options: Socks5Client.Options,
	): Promise<Buffer> {
		const portBytes = Buffer.from([port >> 8, port & 0xff]);
		let address: Buffer;

		const ipVersion = net.isIP(host);
		if (ipVersion === 4) {
			address = Buffer.from([0x01, ...host.split(".").map(Number)]);
		} else if (ipVersion === 6) {
			address = Buffer.concat([Buffer.from([0x04]), ipv6ToBytes(host)]);
		} else if (options.remoteDns !== false) {
			// socks5h semantics: let the proxy resolve the name (no local DNS leak).
			const name = Buffer.from(host);
			address = Buffer.concat([Buffer.from([0x03, name.length]), name]);
		} else {
			const resolved = await lookup(host);
			return this.buildConnectRequest(resolved.address, port, { ...options, remoteDns: true });
		}

		return Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, portBytes]);
	}
}

export namespace Socks5Client {
	export interface Options {
		proxyHost: string;
		proxyPort: number;
		username?: string;
		password?: string;
		targetHost: string;
		targetPort: number;
		/** Resolve hostnames on the proxy (socks5h). Default true. */
		remoteDns?: boolean;
		timeoutMs?: number;
	}

	export const REPLY_MESSAGES: Record<number, string> = {
		1: "general SOCKS server failure",
		2: "connection not allowed by ruleset",
		3: "network unreachable",
		4: "host unreachable",
		5: "connection refused",
		6: "TTL expired",
		7: "command not supported",
		8: "address type not supported",
	};
}

function ipv6ToBytes(ip: string): Buffer {
	const [head = "", tail = ""] = ip.split("::");
	const headParts = head ? head.split(":") : [];
	const tailParts = tail ? tail.split(":") : [];
	const missing = 8 - headParts.length - tailParts.length;
	const parts = [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts];
	const buffer = Buffer.alloc(16);
	parts.forEach((part, i) => buffer.writeUInt16BE(Number.parseInt(part || "0", 16), i * 2));
	return buffer;
}

/** Pull-style reader over a socket's data events, used for the handshake only. */
class SocketReader {
	private buffer = Buffer.alloc(0);
	private waiter: { size: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null =
		null;
	private failure: Error | null = null;

	private readonly onData = (chunk: Buffer) => {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		this.flush();
	};
	private readonly onEnd = (err?: Error) => {
		this.failure = err instanceof Error ? err : new Error("SOCKS5 connection closed");
		this.waiter?.reject(this.failure);
		this.waiter = null;
	};

	constructor(private readonly socket: net.Socket) {
		socket.on("data", this.onData);
		socket.on("error", this.onEnd);
		socket.on("close", this.onEnd);
	}

	read(size: number): Promise<Buffer> {
		if (this.failure) return Promise.reject(this.failure);
		return new Promise((resolve, reject) => {
			this.waiter = { size, resolve, reject };
			this.flush();
		});
	}

	private flush() {
		if (!this.waiter || this.buffer.length < this.waiter.size) return;
		const { size, resolve } = this.waiter;
		this.waiter = null;
		const chunk = this.buffer.subarray(0, size);
		this.buffer = this.buffer.subarray(size);
		resolve(chunk);
	}

	/** Detach from the socket and hand back any bytes read past the handshake. */
	release(): Buffer {
		// Pause first: in flowing mode, data emitted before the caller pipes would be lost.
		this.socket.pause();
		this.socket.off("data", this.onData);
		this.socket.off("error", this.onEnd);
		this.socket.off("close", this.onEnd);
		return this.buffer;
	}
}
