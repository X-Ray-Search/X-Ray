import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import net from "net";
import { DB } from "../server/lib/db";
import { ProxyManager } from "../server/lib/proxy";
import { SocksBridge } from "../server/lib/proxy/socks/bridge";
import { HttpProxyTransport } from "../server/lib/proxy/transports/http";
import { Socks5Transport } from "../server/lib/proxy/transports/socks5";
import { XRayGatewayTransport } from "../server/lib/proxy/transports/xrayGateway";
import { SettingsHandler } from "../server/lib/settings";

let target: ReturnType<typeof Bun.serve>;
let targetURL: string;

/** Minimal SOCKS5 server (optionally with username/password auth) for the tests. */
function startSocksServer(credentials?: { username: string; password: string }) {
	const connections: string[] = [];
	const server = net.createServer((client) => {
		let stage: "greeting" | "auth" | "request" | "piped" = "greeting";
		client.on("error", () => client.destroy());
		client.on("data", function onData(buf: Buffer) {
			if (stage === "greeting") {
				const methods = [...buf.subarray(2, 2 + buf[1]!)];
				if (credentials) {
					if (!methods.includes(0x02)) return client.end(Buffer.from([5, 0xff]));
					client.write(Buffer.from([5, 0x02]));
					stage = "auth";
				} else {
					client.write(Buffer.from([5, 0x00]));
					stage = "request";
				}
				return;
			}
			if (stage === "auth") {
				const ulen = buf[1]!;
				const user = buf.subarray(2, 2 + ulen).toString();
				const pass = buf.subarray(3 + ulen, 3 + ulen + buf[2 + ulen]!).toString();
				const ok = user === credentials!.username && pass === credentials!.password;
				client.write(Buffer.from([1, ok ? 0 : 1]));
				if (!ok) return client.end();
				stage = "request";
				return;
			}
			if (stage === "request") {
				const type = buf[3];
				let host = "";
				let offset = 4;
				if (type === 1) {
					host = [...buf.subarray(4, 8)].join(".");
					offset = 8;
				} else if (type === 3) {
					host = buf.subarray(5, 5 + buf[4]!).toString();
					offset = 5 + buf[4]!;
				}
				const port = buf.readUInt16BE(offset);
				connections.push(`${host}:${port}`);
				const upstream = net.connect(port, host === "localhost" ? "127.0.0.1" : host, () => {
					client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
					client.off("data", onData);
					client.pipe(upstream);
					upstream.pipe(client);
				});
				upstream.on("error", () => client.destroy());
				stage = "piped";
			}
		});
	});
	return new Promise<{ server: net.Server; port: number; connections: string[] }>((resolve) =>
		server.listen(0, "127.0.0.1", () =>
			resolve({ server, port: (server.address() as net.AddressInfo).port, connections }),
		),
	);
}

beforeAll(() => {
	target = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/echo") {
				return Response.json({
					method: req.method,
					body: req.method === "POST" ? await req.text() : null,
					ua: req.headers.get("user-agent"),
					proxyAuth: req.headers.get("proxy-authorization"),
				});
			}
			return new Response("hello from target", { headers: { "X-Target": "yes" } });
		},
	});
	targetURL = `http://127.0.0.1:${target.port}`;
});

afterAll(async () => {
	target.stop(true);
	await DB.instance().delete(DB.Tables.proxies).run();
	await SettingsHandler.updateInstance({ default_proxy_ids: [] });
	await ProxyManager.reload();
});

describe("SOCKS5", () => {
	test("tunnels plain HTTP through the bridge (no auth, remote DNS)", async () => {
		const socks = await startSocksServer();
		const transport = new Socks5Transport(1, "socks", {
			host: "127.0.0.1",
			port: socks.port,
			username: "",
			password: "",
			remote_dns: true,
		});
		const res = await transport.fetch(`http://localhost:${target.port}/echo`, {
			headers: { "User-Agent": "xray-test" },
		});
		const body = (await res.json()) as any;
		expect(body.ua).toBe("xray-test");
		// The bridge's credentials must not leak to the target.
		expect(body.proxyAuth).toBeNull();
		expect(socks.connections).toEqual([`localhost:${target.port}`]);
		await transport.close();
		socks.server.close();
	});

	test("authenticates with username/password and forwards request bodies", async () => {
		const socks = await startSocksServer({ username: "alice", password: "s3cret" });
		const transport = new Socks5Transport(2, "socks", {
			host: "127.0.0.1",
			port: socks.port,
			username: "alice",
			password: "s3cret",
			remote_dns: false,
		});
		const res = await transport.fetch(`${targetURL}/echo`, { method: "POST", body: "payload" });
		expect(((await res.json()) as any).body).toBe("payload");
		await transport.close();

		const wrong = new Socks5Transport(3, "socks", {
			host: "127.0.0.1",
			port: socks.port,
			username: "alice",
			password: "nope",
			remote_dns: true,
		});
		await expect(wrong.fetch(`${targetURL}/`)).rejects.toThrow("SOCKS5 authentication failed");
		await wrong.close();
		socks.server.close();
	});

	test("CONNECT tunnels are established after checking the bridge credentials", async () => {
		const socks = await startSocksServer();
		const bridge = new SocksBridge({ host: "127.0.0.1", port: socks.port });
		const proxy = new URL(await bridge.getProxyUrl());

		const talk = (auth: string | null) =>
			new Promise<string>((resolve, reject) => {
				const socket = net.connect(Number(proxy.port), "127.0.0.1");
				let data = "";
				let tunneled = false;
				socket.on("data", (chunk) => {
					data += chunk.toString();
					if (!tunneled && data.includes("\r\n\r\n") && data.startsWith("HTTP/1.1 200")) {
						tunneled = true;
						socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
					}
				});
				socket.on("end", () => resolve(data));
				socket.on("error", reject);
				const authHeader = auth ? `Proxy-Authorization: ${auth}\r\n` : "";
				socket.write(
					`CONNECT 127.0.0.1:${target.port} HTTP/1.1\r\nHost: 127.0.0.1:${target.port}\r\n${authHeader}\r\n`,
				);
			});

		const basic = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
		const tunneled = await talk(basic);
		expect(tunneled.startsWith("HTTP/1.1 200 Connection Established")).toBe(true);
		expect(tunneled).toContain("hello from target");

		expect(await talk(null)).toStartWith("HTTP/1.1 407");
		expect(await talk("Basic eHJheTp3cm9uZw==")).toStartWith("HTTP/1.1 407");

		await bridge.close();
		socks.server.close();
	});
});

describe("HTTP proxy", () => {
	test("routes requests through a forward proxy with credentials", async () => {
		let seenAuth: string | null = null;
		const forward = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			async fetch(req) {
				seenAuth = req.headers.get("proxy-authorization");
				const headers = new Headers(req.headers);
				headers.delete("proxy-authorization");
				return fetch(req.url, { method: req.method, headers });
			},
		});
		const transport = new HttpProxyTransport(4, "http", {
			url: `http://127.0.0.1:${forward.port}`,
			username: "bob",
			password: "p@ss",
		});
		const res = await transport.fetch(`${targetURL}/`);
		expect(await res.text()).toBe("hello from target");
		expect(seenAuth!).toBe(`Basic ${Buffer.from("bob:p@ss").toString("base64")}`);
		forward.stop(true);
	});
});

describe("X-Ray gateway", () => {
	let gateway: ReturnType<typeof Bun.serve>;
	const requests: any[] = [];

	beforeAll(() => {
		gateway = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			async fetch(req) {
				const auth = req.headers.get("authorization");
				if (auth !== `Basic ${btoa("x-ray:gw-token")}`)
					return new Response("Forbidden: Invalid credentials", { status: 403 });
				const config = (await req.json()) as any;
				requests.push(config);
				if (config.url.endsWith("/mislabelled")) {
					// Like a runtime that decoded the body but kept the header.
					return new Response("plain text body", { headers: { "Content-Encoding": "gzip" } });
				}
				if (config.url.endsWith("/gzipped")) {
					return new Response(Bun.gzipSync(Buffer.from("really gzipped")), {
						headers: { "Content-Encoding": "gzip" },
					});
				}
				const body =
					config.init.bodyEncoding === "base64"
						? Buffer.from(config.init.body, "base64")
						: config.init.body;
				const res = await fetch(config.url, {
					method: config.init.method,
					headers: config.init.headers,
					body,
				});
				return new Response(res.body, { status: res.status, headers: res.headers });
			},
		});
	});

	afterAll(() => gateway.stop(true));

	test("uses the JSON-RPC fetch endpoint with basic auth", async () => {
		const transport = new XRayGatewayTransport(5, "gw", {
			url: `http://127.0.0.1:${gateway.port}/`,
			token: "gw-token",
		});
		const res = await transport.fetch(`${targetURL}/echo`, {
			method: "POST",
			body: "hi",
			headers: { "User-Agent": "gw-test" },
		});
		expect((await res.json()) as any).toMatchObject({ method: "POST", body: "hi", ua: "gw-test" });
		expect(requests.at(-1)).toMatchObject({
			returnFormat: "raw",
			init: { method: "POST", bodyEncoding: "text", redirect: "follow" },
		});
		expect(requests.at(-1).init.headers["Accept-Encoding"]).toBe("identity");

		const binary = await transport.fetch(`${targetURL}/echo`, {
			method: "POST",
			body: new Uint8Array([104, 105]),
		});
		expect(((await binary.json()) as any).body).toBe("hi");
		expect(requests.at(-1).init.bodyEncoding).toBe("base64");
	});

	test("copes with mislabelled and real content encodings", async () => {
		const transport = new XRayGatewayTransport(6, "gw", {
			url: `http://127.0.0.1:${gateway.port}`,
			token: "gw-token",
		});
		expect(await (await transport.fetch(`${targetURL}/mislabelled`)).text()).toBe("plain text body");
		expect(await (await transport.fetch(`${targetURL}/gzipped`)).text()).toBe("really gzipped");
	});

	test("reports wrong tokens as HTTP errors", async () => {
		const transport = new XRayGatewayTransport(7, "gw", {
			url: `http://127.0.0.1:${gateway.port}`,
			token: "wrong",
		});
		expect((await transport.fetch(`${targetURL}/`)).status).toBe(403);
	});
});

describe("ProxyManager", () => {
	test("uses direct connections without configured proxies", async () => {
		const [transport] = await ProxyManager.resolve([]);
		expect(transport?.name).toBe("Direct");
		expect(await (await ProxyManager.fetch(`${targetURL}/`)).text()).toBe("hello from target");
	});

	test("rotates, fails over, and fails closed", async () => {
		const socks = await startSocksServer();
		const [good, dead, disabled] = await DB.instance()
			.insert(DB.Tables.proxies)
			.values([
				{ name: "good", proxy_type: "socks5", settings: { host: "127.0.0.1", port: socks.port } },
				{ name: "dead", proxy_type: "socks5", settings: { host: "127.0.0.1", port: 1 } },
				{ name: "off", proxy_type: "direct", enabled: false, settings: {} },
			])
			.returning()
			.all();
		await ProxyManager.reload();

		// Two requests over [dead, good]: both succeed thanks to failover.
		for (let i = 0; i < 2; i++) {
			const res = await ProxyManager.fetch(`${targetURL}/`, {}, { proxyIds: [dead!.id, good!.id] });
			expect(await res.text()).toBe("hello from target");
		}
		expect(socks.connections.length).toBe(2);

		await expect(
			ProxyManager.fetch(`${targetURL}/`, {}, { proxyIds: [disabled!.id] }),
		).rejects.toBeInstanceOf(ProxyManager.NoProxyAvailableError);

		// The instance default list applies when no explicit list is given.
		await SettingsHandler.updateInstance({ default_proxy_ids: [good!.id] });
		expect((await ProxyManager.resolve([])).map((t) => t.name)).toEqual(["good"]);
		await SettingsHandler.updateInstance({ default_proxy_ids: [] });

		socks.server.close();
	});

	test("hides secret settings", () => {
		expect(ProxyManager.toPublicSettings("socks5", { host: "h", password: "x" })).toEqual({
			settings: { host: "h" },
			secrets_set: ["password"],
		});
	});
});
