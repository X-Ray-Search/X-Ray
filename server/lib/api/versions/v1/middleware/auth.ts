import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppConstants } from "../../../../utils/constants";
import { APIResponse } from "../../../utils/api-res";
import { AuthHandler } from "../../../utils/authHandler";

/**
 * Paths that stay reachable with a missing, stale or invalid token — the caller is treated as
 * unauthenticated and the route decides (login/reset, public instance info, signed media).
 */
const TOLERANT_PREFIXES = ["/v1/auth/login", "/v1/auth/reset-password", "/v1/instance", "/v1/proxy/"];

/**
 * Browser-initiated GETs that cannot send an Authorization header (OpenSearch suggestions from
 * the address bar) may authenticate with the session cookie instead. Read-only, so no CSRF risk.
 */
const COOKIE_AUTH_PATHS = ["/v1/search/suggest/opensearch"];

export const SESSION_COOKIE_NAME = `${AppConstants.APP_KEYS_PREFIX}_session_token`;

/** Path relative to the Hono app, independent of the `/api` mount prefix used by Nitro. */
function appPath(path: string) {
	return path.replace(/^\/api(?=\/)/, "");
}

export const authMiddlewareV1 = createMiddleware(async (c, next) => {
	const path = appPath(c.req.path);
	const tolerant = TOLERANT_PREFIXES.some((prefix) => path.startsWith(prefix));
	const unauthenticated = async () => {
		AuthHandler.AuthContext.set(c, { type: "unauthenticated" } satisfies AuthHandler.UnauthenticatedAuthContext);
		return await next();
	};

	let token: string | undefined;
	const authHeader = c.req.header("Authorization");

	if (authHeader) {
		if (!authHeader.startsWith("Bearer ")) {
			if (tolerant) return unauthenticated();
			return APIResponse.unauthorized(c, "Invalid Authorization header");
		}
		token = authHeader.substring("Bearer ".length);
	} else if (c.req.method === "GET" && COOKIE_AUTH_PATHS.includes(path)) {
		token = getCookie(c, SESSION_COOKIE_NAME);
	}

	if (!token) return unauthenticated();

	const authContext = await AuthHandler.getAuthContext(token);

	if (!authContext || !(await AuthHandler.isValidAuthContext(authContext))) {
		if (tolerant || !authHeader) return unauthenticated();
		return APIResponse.unauthorized(c, "Invalid or expired token");
	}

	AuthHandler.AuthContext.set(c, authContext);

	return await next();
});
