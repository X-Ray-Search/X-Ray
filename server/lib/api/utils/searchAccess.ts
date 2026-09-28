import type { Context } from "hono";
import { SettingsHandler } from "../../settings";
import { APIResponse } from "./api-res";
import { AuthHandler } from "./authHandler";
import { RateLimiter } from "./rateLimiter";
import { RequestInfo } from "./requestInfo";

/**
 * Enforces the instance's `search_access` setting for every search-like endpoint.
 * Authenticated callers (session or API key) always pass; anonymous callers pass only when the
 * instance is public, subject to the per-IP rate limit.
 */
export class SearchAccess {
	static async check(c: Context): Promise<SearchAccess.Result> {
		const authContext = AuthHandler.AuthContext.get(c);
		if (authContext.type !== "unauthenticated") {
			return { ok: true, userID: authContext.user_id };
		}

		const settings = await SettingsHandler.getInstance();
		if (settings.search_access !== "public") {
			return {
				ok: false,
				response: APIResponse.unauthorized(c, "This instance requires you to sign in to search"),
			};
		}

		const ip = RequestInfo.clientIP(c) ?? "unknown";
		const limit = RateLimiter.hit(`search:${ip}`, settings.public_rate_limit_per_minute);
		if (!limit.allowed) {
			c.header("Retry-After", String(limit.retryAfterSeconds));
			return {
				ok: false,
				response: APIResponse.tooManyRequests(
					c,
					`Too many searches. Try again in ${limit.retryAfterSeconds}s`,
				),
			};
		}
		return { ok: true, userID: null };
	}
}

export namespace SearchAccess {
	export type Result = { ok: true; userID: number | null } | { ok: false; response: Response };
}
