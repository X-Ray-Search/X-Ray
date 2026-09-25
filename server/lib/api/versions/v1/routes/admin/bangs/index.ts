import { Hono } from "hono";
import { BangDataset } from "../../../../../../bangs/dataset";
import { SettingsModels } from "../../../../../../settings/models";
import { APIResponse } from "../../../../../utils/api-res";
import { registerCustomBangRoutes } from "../../../../../utils/customBangRoutes";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";

/** Instance-wide custom bangs and the DuckDuckGo dataset. */
export const router = new Hono().basePath("/bangs");

router.get(
	"/dataset",
	APIRouteSpec.authenticated({
		summary: "DuckDuckGo bang dataset status",
		tags: [DOCS_TAGS.ADMIN_API.BANGS],
		responses: APIResponseSpec.describeBasic(APIResponseSpec.success("Dataset status retrieved", SettingsModels.BangDatasetStatus)),
	}),
	async (c) => APIResponse.success(c, "Dataset status retrieved", await BangDataset.status()),
);

router.post(
	"/dataset/refresh",
	APIRouteSpec.authenticated({
		summary: "Refresh the DuckDuckGo bang dataset",
		description: "Downloads https://duckduckgo.com/bang.js through the default proxies and replaces the local copy.",
		tags: [DOCS_TAGS.ADMIN_API.BANGS],
		responses: APIResponseSpec.describeBasic(APIResponseSpec.success("Dataset refreshed", SettingsModels.BangDatasetStatus)),
	}),
	async (c) => APIResponse.success(c, "Dataset refreshed", await BangDataset.refresh()),
);

registerCustomBangRoutes(router, {
	tag: DOCS_TAGS.ADMIN_API.BANGS,
	scope: "instance",
	owner: () => null,
});
