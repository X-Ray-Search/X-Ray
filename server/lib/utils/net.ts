import { lookup } from "dns/promises";
import net from "net";

/** Network helpers for outbound fetches of user-influenced URLs (SSRF protection). */
export class NetUtils {
	private static readonly BLOCKED_HOST_SUFFIXES = [
		".local",
		".localhost",
		".internal",
		".lan",
		".home.arpa",
	];

	/** True for loopback, private, link-local, CGNAT and other non-public addresses. */
	static isPrivateIP(ip: string): boolean {
		const version = net.isIP(ip);
		if (version === 4) {
			const [a = 0, b = 0] = ip.split(".").map(Number);
			return (
				a === 0 ||
				a === 10 ||
				a === 127 ||
				(a === 100 && b >= 64 && b <= 127) ||
				(a === 169 && b === 254) ||
				(a === 172 && b >= 16 && b <= 31) ||
				(a === 192 && b === 168) ||
				(a === 198 && (b === 18 || b === 19)) ||
				a >= 224
			);
		}
		if (version === 6) {
			const normalized = ip.toLowerCase();
			if (normalized === "::" || normalized === "::1") return true;
			const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
			if (mapped) return this.isPrivateIP(mapped[1]!);
			return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(normalized);
		}
		return false;
	}

	/** Reject URLs that point at the local network (literal IPs, local names, resolved names). */
	static async isPublicURL(value: string, resolve = true): Promise<boolean> {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return false;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") return false;

		const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
		if (!host || host === "localhost" || this.BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
			return false;
		}
		if (net.isIP(host)) return !this.isPrivateIP(host);
		if (!host.includes(".")) return false;
		if (!resolve) return true;

		try {
			const addresses = await lookup(host, { all: true });
			return addresses.length > 0 && addresses.every((a) => !this.isPrivateIP(a.address));
		} catch {
			return false;
		}
	}
}
