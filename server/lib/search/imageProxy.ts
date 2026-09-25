import { createHmac, timingSafeEqual } from "crypto";
import { SettingsHandler } from "../settings";
import type { SearchModels } from "./types";

/**
 * Signed image-proxy URLs. Thumbnails in search results point at third-party CDNs; with the
 * image proxy enabled they are rewritten to `/api/v1/proxy/image?url=…&sig=…` so the browser
 * only ever talks to X-Ray. The HMAC signature keeps the endpoint from being an open proxy.
 */
export class ImageProxy {
	static readonly PATH = "/api/v1/proxy/image";

	private static async signature(url: string) {
		return createHmac("sha256", await SettingsHandler.getImageProxyKey())
			.update(url)
			.digest("hex")
			.slice(0, 32);
	}

	static async sign(url: string): Promise<string> {
		return `${this.PATH}?${new URLSearchParams({ url, sig: await this.signature(url) })}`;
	}

	static async verify(url: string, sig: string): Promise<boolean> {
		const expected = Buffer.from(await this.signature(url));
		const actual = Buffer.from(sig);
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	}

	static faviconURL(domain: string) {
		return `/api/v1/proxy/favicon?${new URLSearchParams({ domain })}`;
	}

	/** Rewrite the media URLs of a result list (returns new objects). */
	static async rewriteResults(results: SearchModels.Result[]): Promise<SearchModels.Result[]> {
		return Promise.all(
			results.map(async (result) => ({
				...result,
				thumbnail: result.thumbnail ? await this.sign(result.thumbnail) : null,
				img_src: result.img_src ? await this.sign(result.img_src) : null,
			})),
		);
	}
}
