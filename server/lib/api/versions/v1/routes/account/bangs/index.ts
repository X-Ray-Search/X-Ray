import { Hono } from "hono";
import { AuthHandler } from "../../../../../utils/authHandler";
import { registerCustomBangRoutes } from "../../../../../utils/customBangRoutes";
import { DOCS_TAGS } from "../../../docs";

/** Personal bangs of the signed-in user — they take precedence over every other bang. */
export const router = new Hono().basePath("/bangs");

registerCustomBangRoutes(router, {
	tag: DOCS_TAGS.ACCOUNT_BANGS,
	scope: "personal",
	owner: (c) => AuthHandler.AuthContext.getAsSession(c).user_id,
});
