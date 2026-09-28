import { type Context, Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { z } from "zod";
import { ProxyManager } from "../../../../../proxy";
import { TTLCache } from "../../../../../search/cache";
import { ImageProxy } from "../../../../../search/imageProxy";
import { Logger } from "../../../../../utils/logger";
import { NetUtils } from "../../../../../utils/net";
import { RateLimiter } from "../../../../utils/rateLimiter";
import { RequestInfo } from "../../../../utils/requestInfo";
import { DOCS_TAGS } from "../../docs";

/**
 * Media proxy: serves result thumbnails and favicons so the browser never contacts third-party
 * CDNs. Returns raw images (not the JSON envelope); errors are plain status codes because the
 * consumer is an `<img>` tag.
 */
export const router = new Hono().basePath("/proxy");

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0";
const faviconCache = new TTLCache<{ body: Uint8Array; type: string } | null>(4000, 24 * 3_600_000);

const SECURITY_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Referrer-Policy": "no-referrer",
};

/** Fetch an image, re-checking every redirect hop against the SSRF guard. */
async function fetchImage(
	url: string,
): Promise<{ body: Uint8Array; type: string } | { status: number }> {
	let current = url;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!(await NetUtils.isPublicURL(current))) return { status: 403 };

		const res = await ProxyManager.fetch(current, {
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
			},
			redirect: "manual",
			signal: AbortSignal.timeout(10_000),
		});

		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location");
			if (!location) return { status: 502 };
			current = new URL(location, current).toString();
			continue;
		}
		if (!res.ok) return { status: 502 };

		const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
		if (!type.startsWith("image/")) return { status: 415 };
		if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return { status: 413 };

		const body = new Uint8Array(await res.arrayBuffer());
		if (body.byteLength > MAX_IMAGE_BYTES) return { status: 413 };
		return { body, type };
	}
	return { status: 508 };
}

function limited(c: Context) {
	return !RateLimiter.hit(`media:${RequestInfo.clientIP(c) ?? "unknown"}`, 1200).allowed;
}

router.get(
	"/image",

	describeRoute({
		summary: "Proxied image",
		description:
			"Serves a result image through X-Ray. Only URLs signed by X-Ray (`sig`) are accepted.",
		tags: [DOCS_TAGS.MEDIA_PROXY],
		security: [],
		responses: {
			200: { description: "The image" },
			403: { description: "Invalid signature or blocked URL" },
		},
	}),

	zValidator("query", z.object({ url: z.string().min(1).max(4096), sig: z.string().length(32) })),

	async (c) => {
		const { url, sig } = c.req.valid("query") as { url: string; sig: string };
		if (!(await ImageProxy.verify(url, sig))) return c.body(null, 403);
		if (limited(c)) return c.body(null, 429);

		try {
			const result = await fetchImage(url);
			if ("status" in result) return c.body(null, result.status as 403);
			return c.body(result.body as Uint8Array<ArrayBuffer>, 200, {
				...SECURITY_HEADERS,
				"Content-Type": result.type,
				"Cache-Control": "public, max-age=86400, immutable",
			});
		} catch (err) {
			Logger.debug("Image proxy failed:", (err as Error).message);
			return c.body(null, 502);
		}
	},
);

router.get(
	"/favicon",

	describeRoute({
		summary: "Proxied favicon",
		description: "Serves the favicon of a domain through X-Ray (cached for 24 h).",
		tags: [DOCS_TAGS.MEDIA_PROXY],
		security: [],
		responses: { 200: { description: "The icon" }, 404: { description: "No icon found" } },
	}),

	zValidator(
		"query",
		z.object({
			domain: z
				.string()
				.max(253)
				.regex(/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i),
		}),
	),

	async (c) => {
		const domain = (c.req.valid("query") as { domain: string }).domain.toLowerCase();
		if (limited(c)) return c.body(null, 429);

		let icon = faviconCache.get(domain);
		if (icon === undefined) {
			try {
				const result = await fetchImage(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
				icon = "status" in result ? null : result;
			} catch {
				icon = null;
			}
			faviconCache.set(domain, icon);
		}
		if (!icon) return c.body(null, 404, { "Cache-Control": "public, max-age=3600" });

		return c.body(icon.body as Uint8Array<ArrayBuffer>, 200, {
			...SECURITY_HEADERS,
			"Content-Type": icon.type,
			"Cache-Control": "public, max-age=604800",
		});
	},
);
