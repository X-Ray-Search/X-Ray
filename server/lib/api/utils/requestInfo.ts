import type { Context } from "hono";
import { ConfigHandler } from "../../utils/config";

/** Client information that survives the Nitro → Hono hand-off. */
export class RequestInfo {
	/** Set by `server/routes/api/[...].ts` from the socket address (client values are stripped). */
	static readonly CLIENT_IP_HEADER = "x-xray-client-ip";

	/**
	 * The client IP. Behind a reverse proxy set `XRAY_TRUST_PROXY=true` so the first
	 * `X-Forwarded-For` / `X-Real-IP` entry is used instead of the proxy's address.
	 */
	static clientIP(c: Context): string | null {
		if (ConfigHandler.getConfig()?.TRUST_PROXY) {
			const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
			const real = c.req.header("x-real-ip")?.trim();
			if (forwarded || real) return RequestInfo.normalize(forwarded || real!);
		}
		const direct = c.req.header(RequestInfo.CLIENT_IP_HEADER) ?? (c.req.raw as any)?.remoteAddr?.hostname;
		return direct ? RequestInfo.normalize(direct) : null;
	}

	static userAgent(c: Context): string | null {
		return c.req.header("user-agent") ?? null;
	}

	private static normalize(ip: string) {
		return ip.replace(/^::ffff:/, "");
	}
}
