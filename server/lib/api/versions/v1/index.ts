import { Hono } from "hono";
import type { GenerateSpecOptions } from "hono-openapi";
import { AppConstants } from "../../../utils/constants";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import { DOCS_TAGS } from "./docs";
import { authMiddlewareV1 } from "./middleware/auth";
import { router as accountRouter } from "./routes/account";
import { router as adminRouter } from "./routes/admin";
import { router as authRouter } from "./routes/auth";
import { router as bangsRouter } from "./routes/bangs";
import { router as instanceRouter } from "./routes/instance";
import { router as proxyRouter } from "./routes/proxy";
import { router as searchRouter } from "./routes/search";

const subTag = (name: string, parent: string, description: string) => ({
	name,
	// @ts-ignore Scalar extension
	"x-displayName": name.split(" / ").at(-1),
	summary: name.split(" / ").at(-1),
	parent,
	description,
});

const openAPIConfig: Partial<GenerateSpecOptions> = {
	documentation: {
		info: {
			title: `${AppConstants.APP_NAME} API`,
			version: "1.0.0",
			description: `API of the ${AppConstants.APP_NAME} meta search engine, used by its frontend and third-party clients. A SearXNG compatible API is available under \`/api/searxng\`.`,
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					// Opaque session tokens / API keys (`xray_sess_…`, `xray_apikey_…`) — not JWTs.
					description: "Enter your session token or API key in the format **Bearer &lt;token&gt;**",
				},
			},
			responses: {
				401: {
					description: "Authentication information is missing or invalid",
				},
			},
		},

		security: [{ bearerAuth: [] }],

		servers: [{ url: "/api/v1", description: "This instance" }],

		"x-tagGroups": [
			{ name: "Search", tags: [DOCS_TAGS.SEARCH, DOCS_TAGS.BANGS, DOCS_TAGS.MEDIA_PROXY, DOCS_TAGS.INSTANCE] },
			{
				name: "Account & Authentication",
				tags: [
					DOCS_TAGS.ACCOUNT,
					DOCS_TAGS.ACCOUNT_API_KEYS,
					DOCS_TAGS.ACCOUNT_PREFERENCES,
					DOCS_TAGS.ACCOUNT_BANGS,
					DOCS_TAGS.AUTHENTICATION,
				],
			},
			{
				name: "Admin",
				tags: [
					DOCS_TAGS.ADMIN_API.USERS,
					DOCS_TAGS.ADMIN_API.ENGINES,
					DOCS_TAGS.ADMIN_API.PROXIES,
					DOCS_TAGS.ADMIN_API.SETTINGS,
					DOCS_TAGS.ADMIN_API.BANGS,
				],
			},
		],

		tags: [
			{ name: DOCS_TAGS.SEARCH, description: "Metasearch, autocomplete and AI answers" },
			{ name: DOCS_TAGS.BANGS, description: "Bang suggestions and resolution" },
			{ name: DOCS_TAGS.MEDIA_PROXY, description: "Privacy proxy for thumbnails and favicons" },
			{ name: DOCS_TAGS.INSTANCE, description: "Public instance information" },
			{ name: DOCS_TAGS.ACCOUNT, description: "Endpoints for user account management" },
			subTag(DOCS_TAGS.ACCOUNT_API_KEYS, DOCS_TAGS.ACCOUNT, "API keys (also used for the SearXNG API)"),
			subTag(DOCS_TAGS.ACCOUNT_PREFERENCES, DOCS_TAGS.ACCOUNT, "Personal overrides of the instance search settings"),
			subTag(DOCS_TAGS.ACCOUNT_BANGS, DOCS_TAGS.ACCOUNT, "Personal custom bangs"),
			{ name: DOCS_TAGS.AUTHENTICATION, description: "Endpoints for authentication and authorization" },
			subTag(DOCS_TAGS.ADMIN_API.USERS, DOCS_TAGS.ADMIN_API.BASE, "User management"),
			subTag(DOCS_TAGS.ADMIN_API.ENGINES, DOCS_TAGS.ADMIN_API.BASE, "Search engine configuration"),
			subTag(DOCS_TAGS.ADMIN_API.PROXIES, DOCS_TAGS.ADMIN_API.BASE, "Outbound proxy configuration"),
			subTag(DOCS_TAGS.ADMIN_API.SETTINGS, DOCS_TAGS.ADMIN_API.BASE, "Instance, search default and AI settings"),
			subTag(DOCS_TAGS.ADMIN_API.BANGS, DOCS_TAGS.ADMIN_API.BASE, "Instance bangs and the DuckDuckGo dataset"),
		],
	},
};

const router = new Hono();

router.use(authMiddlewareV1);

router.route("/", instanceRouter);
router.route("/", searchRouter);
router.route("/", bangsRouter);
router.route("/", proxyRouter);
router.route("/", authRouter);
router.route("/", accountRouter);
router.route("/", adminRouter);

export class APIv1Router extends APIVersionRouter {
	constructor() {
		super({
			version: 1,
			openAPIConfig,
			routes: router,
		});
	}
}
