import type { Context, Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { CustomBangs } from "../../bangs/custom";
import { APIResponse } from "./api-res";
import { CustomBangModels } from "./shared-models/bangs";
import { APIResponseSpec, APIRouteSpec } from "./specHelpers";

/**
 * Registers list/create/update/delete routes for custom bangs on `router`. Used for personal
 * bangs (`/account/bangs`, owner = the session user) and instance bangs (`/admin/bangs`,
 * owner = null).
 */
export function registerCustomBangRoutes(
	router: Hono,
	options: { tag: string; scope: string; owner: (c: Context) => number | null },
) {
	router.get(
		"/",
		APIRouteSpec.authenticated({
			summary: `List ${options.scope} bangs`,
			tags: [options.tag],
			responses: APIResponseSpec.describeBasic(
				APIResponseSpec.success("Bangs retrieved", CustomBangModels.Bang.array()),
			),
		}),
		async (c) => APIResponse.success(c, "Bangs retrieved", await CustomBangs.list(options.owner(c))),
	);

	router.post(
		"/",
		APIRouteSpec.authenticated({
			summary: `Create a ${options.scope} bang`,
			description: "Use `{{{s}}}` (or `%s`) in the URL template where the query should go.",
			tags: [options.tag],
			responses: APIResponseSpec.describeWithWrongInputs(
				APIResponseSpec.created("Bang created", CustomBangModels.Bang),
				APIResponseSpec.conflict("A bang with this trigger already exists"),
			),
		}),
		zValidator("json", CustomBangModels.Body),
		async (c) => {
			const body = c.req.valid("json") as CustomBangModels.Body;
			const result = await CustomBangs.create(options.owner(c), body);
			if (result === "conflict") return APIResponse.conflict(c, "A bang with this trigger already exists");
			return APIResponse.created(c, "Bang created", result);
		},
	);

	router.put(
		"/:bangID",
		APIRouteSpec.authenticated({
			summary: `Update a ${options.scope} bang`,
			tags: [options.tag],
			responses: APIResponseSpec.describeWithWrongInputs(
				APIResponseSpec.success("Bang updated", CustomBangModels.Bang),
				APIResponseSpec.notFound("Bang not found"),
				APIResponseSpec.conflict("A bang with this trigger already exists"),
			),
		}),
		zValidator("param", CustomBangModels.Params),
		zValidator("json", CustomBangModels.Body),
		async (c) => {
			const { bangID } = c.req.valid("param") as CustomBangModels.Params;
			const body = c.req.valid("json") as CustomBangModels.Body;
			const result = await CustomBangs.update(options.owner(c), bangID, body);
			if (result === "not_found") return APIResponse.notFound(c, "Bang not found");
			if (result === "conflict") return APIResponse.conflict(c, "A bang with this trigger already exists");
			return APIResponse.success(c, "Bang updated", result);
		},
	);

	router.delete(
		"/:bangID",
		APIRouteSpec.authenticated({
			summary: `Delete a ${options.scope} bang`,
			tags: [options.tag],
			responses: APIResponseSpec.describeWithWrongInputs(
				APIResponseSpec.successNoData("Bang deleted"),
				APIResponseSpec.notFound("Bang not found"),
			),
		}),
		zValidator("param", CustomBangModels.Params),
		async (c) => {
			const { bangID } = c.req.valid("param") as CustomBangModels.Params;
			if (!(await CustomBangs.delete(options.owner(c), bangID))) return APIResponse.notFound(c, "Bang not found");
			return APIResponse.successNoData(c, "Bang deleted");
		},
	);
}
