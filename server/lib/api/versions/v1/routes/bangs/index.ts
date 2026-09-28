import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { BangService } from "../../../../../bangs";
import { SettingsHandler } from "../../../../../settings";
import { APIResponse } from "../../../../utils/api-res";
import { SearchAccess } from "../../../../utils/searchAccess";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../docs";
import { BangsModel } from "./model";

export const router = new Hono().basePath("/bangs");

router.get(
	"/suggest",

	APIRouteSpec.custom({
		summary: "Suggest bangs",
		description:
			"Bangs whose trigger starts with the given prefix — personal, instance, internal and DuckDuckGo bangs.",
		tags: [DOCS_TAGS.BANGS],
		security: [{ bearerAuth: [] }, {}],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Bangs retrieved", BangsModel.Suggest.Response),
			APIResponseSpec.unauthorized("This instance requires you to sign in to search"),
		),
	}),

	zValidator("query", BangsModel.Suggest.Query),

	async (c) => {
		const access = await SearchAccess.check(c);
		if (!access.ok) return access.response;

		const { q, limit } = c.req.valid("query") as BangsModel.Suggest.Query;
		const preferences = await SettingsHandler.getEffectivePreferences(access.userID);
		if (!preferences.bangs_enabled) return APIResponse.success(c, "Bangs retrieved", []);

		const bangs = await BangService.suggest(
			q,
			{ userID: access.userID, includeDDG: preferences.ddg_bangs_enabled },
			limit,
		);
		return APIResponse.success(
			c,
			"Bangs retrieved",
			bangs.map((b) => BangService.toPublic(b)) satisfies BangsModel.Suggest.Response,
		);
	},
);

router.get(
	"/resolve",

	APIRouteSpec.custom({
		summary: "Resolve a bang",
		description: "Resolve the bang in a query without searching — handy for browser integrations.",
		tags: [DOCS_TAGS.BANGS],
		security: [{ bearerAuth: [] }, {}],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Bang resolved", BangsModel.Resolve.Response),
			APIResponseSpec.unauthorized("This instance requires you to sign in to search"),
		),
	}),

	zValidator("query", BangsModel.Resolve.Query),

	async (c) => {
		const access = await SearchAccess.check(c);
		if (!access.ok) return access.response;

		const { q } = c.req.valid("query") as BangsModel.Resolve.Query;
		const preferences = await SettingsHandler.getEffectivePreferences(access.userID);
		const resolution = preferences.bangs_enabled
			? await BangService.resolve(q, {
					userID: access.userID,
					includeDDG: preferences.ddg_bangs_enabled,
				})
			: null;

		const response: BangsModel.Resolve.Response = !resolution
			? { kind: "none", url: null, category: null, query: q, bang: null }
			: resolution.kind === "redirect"
				? {
						kind: "redirect",
						url: resolution.url,
						category: null,
						query: BangService.parse(q)?.query ?? q,
						bang: resolution.bang,
					}
				: resolution.kind === "category"
					? {
							kind: "category",
							url: null,
							category: resolution.category,
							query: resolution.query,
							bang: resolution.bang,
						}
					: { kind: "lucky", url: null, category: null, query: resolution.query, bang: null };

		return APIResponse.success(c, "Bang resolved", response);
	},
);
