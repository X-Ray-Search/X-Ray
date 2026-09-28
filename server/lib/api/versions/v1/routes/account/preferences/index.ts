import { Hono } from "hono";
import { validator } from "hono-openapi";
import { SettingsHandler } from "../../../../../../settings";
import { APIResponse } from "../../../../../utils/api-res";
import { AuthHandler } from "../../../../../utils/authHandler";
import { UserPreferencesHandler } from "../../../../../utils/preferences";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AccountPreferencesModel } from "./model";

export const router = new Hono().basePath("/preferences");

async function searchPreferences(userID: number): Promise<AccountPreferencesModel.Search.Response> {
	const [defaults, overrides] = await Promise.all([
		SettingsHandler.getSearchDefaults(),
		SettingsHandler.getUserOverrides(userID),
	]);
	return { defaults, overrides, effective: { ...defaults, ...overrides } };
}

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "Get all preferences",
		description:
			"Retrieve all of the authenticated user's stored preferences in a single request, keyed by the same names as the per-preference routes.",
		tags: [DOCS_TAGS.ACCOUNT_PREFERENCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success(
				"Preferences retrieved successfully",
				AccountPreferencesModel.GetAll.Response,
			),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		const preferences = await UserPreferencesHandler.getAll(authContext.user_id);
		return APIResponse.success(c, "Preferences retrieved successfully", preferences);
	},
);

router.get(
	"/search",

	APIRouteSpec.authenticated({
		summary: "Get search preferences",
		description:
			"The instance defaults, your personal overrides and the resulting effective search preferences.",
		tags: [DOCS_TAGS.ACCOUNT_PREFERENCES],

		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Search preferences retrieved", AccountPreferencesModel.Search.Response),
		),
	}),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		return APIResponse.success(
			c,
			"Search preferences retrieved",
			await searchPreferences(authContext.user_id),
		);
	},
);

router.put(
	"/search",

	APIRouteSpec.authenticated({
		summary: "Set search preference overrides",
		description:
			"Replace your personal overrides. Keys you omit follow the instance default again — send `{}` to reset everything.",
		tags: [DOCS_TAGS.ACCOUNT_PREFERENCES],

		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Search preferences updated", AccountPreferencesModel.Search.Response),
		),
	}),

	validator("json", AccountPreferencesModel.Search.Body),

	async (c) => {
		const authContext = AuthHandler.AuthContext.getAsSession(c);
		const body = c.req.valid("json") as AccountPreferencesModel.Search.Body;
		await SettingsHandler.setUserOverrides(authContext.user_id, body);
		return APIResponse.success(
			c,
			"Search preferences updated",
			await searchPreferences(authContext.user_id),
		);
	},
);
