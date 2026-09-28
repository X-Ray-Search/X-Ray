import { eq, inArray } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { z } from "zod";
import { DB } from "../../../../../../db";
import { SearchAggregator } from "../../../../../../search/aggregator";
import { SearchEngineRegistry } from "../../../../../../search/engines";
import type { SearchEngine } from "../../../../../../search/engines/base";
import { EngineHealth } from "../../../../../../search/health";
import { SearchEngineManager } from "../../../../../../search/manager";
import { SearchService } from "../../../../../../search/service";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminEnginesModel } from "./model";

export const router = new Hono().basePath("/engines");

const ENGINE_KEY = "adminEngine";

function secretFields(type: string) {
	return SearchEngineRegistry.get(type)?.definition.secretFields ?? [];
}

function toModel(row: DB.Models.SearchEngine): AdminEnginesModel.Engine {
	const secrets = secretFields(row.engine_type);
	const settings = { ...row.settings };
	const secretsSet = secrets.filter((field) => !!settings[field]);
	for (const field of secrets) delete settings[field];
	return {
		...row,
		settings,
		secrets_set: secretsSet,
		health: EngineHealth.snapshot(row.slug),
		load_error: SearchEngineManager.getLoadErrors().get(row.slug) ?? null,
	};
}

/** Validate type/categories/settings/proxies; returns the normalized settings or an error message. */
async function validate(
	definition: SearchEngine.Definition | undefined,
	body: { categories?: string[]; settings?: Record<string, any>; proxy_ids?: number[] },
	previousSettings: Record<string, any> = {},
): Promise<{ settings: Record<string, any> } | { error: string }> {
	if (!definition) return { error: "Unknown engine type" };

	if (body.categories?.some((c) => !definition.categories.includes(c as any))) {
		return { error: `This engine only supports: ${definition.categories.join(", ")}` };
	}

	// Secret fields left empty keep their stored value.
	const merged = { ...previousSettings, ...body.settings };
	for (const field of definition.secretFields ?? []) {
		if (body.settings && (body.settings[field] === undefined || body.settings[field] === "")) {
			merged[field] = previousSettings[field];
		}
	}
	const parsed = definition.settings.safeParse(merged);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			error: `Invalid settings${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message}`,
		};
	}

	if (body.proxy_ids?.length) {
		const found = await DB.instance()
			.select({ id: DB.Tables.proxies.id })
			.from(DB.Tables.proxies)
			.where(inArray(DB.Tables.proxies.id, body.proxy_ids))
			.all();
		if (found.length !== new Set(body.proxy_ids).size)
			return { error: "Unknown proxy id in proxy_ids" };
	}
	return { settings: parsed.data as Record<string, any> };
}

async function afterChange() {
	await SearchEngineManager.reload();
	SearchService.clearCache();
}

router.get(
	"/types",

	APIRouteSpec.authenticated({
		summary: "List engine types",
		description: "All registered search engine implementations with their settings JSON Schema.",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Engine types retrieved", AdminEnginesModel.EngineType.array()),
		),
	}),

	async (c) => {
		const types = SearchEngineRegistry.list().map(({ definition }) => ({
			type: definition.type,
			name: definition.name,
			description: definition.description,
			website: definition.website,
			categories: [...definition.categories],
			features: definition.features,
			settings_schema: z.toJSONSchema(definition.settings, { io: "input" }) as Record<string, any>,
			default_settings: definition.settings.safeParse({}).data ?? {},
			secret_fields: [...(definition.secretFields ?? [])],
			requires_configuration: definition.requiresConfiguration ?? false,
			default_timeout_ms: definition.defaultTimeoutMs ?? 4000,
		}));
		return APIResponse.success(c, "Engine types retrieved", types);
	},
);

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List engines",
		description: "All configured search engines, including their health state.",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Engines retrieved", AdminEnginesModel.Engine.array()),
		),
	}),

	async (c) => {
		const rows = await DB.instance()
			.select()
			.from(DB.Tables.searchEngines)
			.orderBy(DB.Tables.searchEngines.id)
			.all();
		return APIResponse.success(c, "Engines retrieved", rows.map(toModel));
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Create engine",
		description:
			"Add a search engine instance. `settings` are validated against the engine type's schema.",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.created("Engine created", AdminEnginesModel.Engine),
			APIResponseSpec.conflict("An engine with this slug already exists"),
		),
	}),

	zValidator("json", AdminEnginesModel.Body),

	async (c) => {
		const body = c.req.valid("json") as AdminEnginesModel.Body;
		const definition = SearchEngineRegistry.get(body.engine_type)?.definition;
		const checked = await validate(definition, body);
		if ("error" in checked) return APIResponse.badRequest(c, checked.error);

		const clash = await DB.instance()
			.select()
			.from(DB.Tables.searchEngines)
			.where(eq(DB.Tables.searchEngines.slug, body.slug))
			.get();
		if (clash) return APIResponse.conflict(c, "An engine with this slug already exists");

		const row = await DB.instance()
			.insert(DB.Tables.searchEngines)
			.values({ ...body, settings: checked.settings })
			.returning()
			.get();
		await afterChange();
		return APIResponse.created(c, "Engine created", toModel(row));
	},
);

router.use(
	"/:engineID/*",

	zValidator("param", AdminEnginesModel.Params),

	async (c, next) => {
		// @ts-expect-error
		const { engineID } = c.req.valid("param") as AdminEnginesModel.Params;
		const row = await DB.instance()
			.select()
			.from(DB.Tables.searchEngines)
			.where(eq(DB.Tables.searchEngines.id, engineID))
			.get();
		if (!row) return APIResponse.notFound(c, "Engine not found");
		// @ts-expect-error
		c.set(ENGINE_KEY, row);
		await next();
	},
);

function engineOf(c: Context) {
	return c.get(ENGINE_KEY) as DB.Models.SearchEngine;
}

router.get(
	"/:engineID",

	APIRouteSpec.authenticated({
		summary: "Get engine",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Engine retrieved", AdminEnginesModel.Engine),
			APIResponseSpec.notFound("Engine not found"),
		),
	}),

	async (c) => APIResponse.success(c, "Engine retrieved", toModel(engineOf(c))),
);

router.put(
	"/:engineID",

	APIRouteSpec.authenticated({
		summary: "Update engine",
		description: "Partial update. Secret settings sent empty keep their stored value.",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Engine updated", AdminEnginesModel.Engine),
			APIResponseSpec.notFound("Engine not found"),
			APIResponseSpec.conflict("An engine with this slug already exists"),
		),
	}),

	zValidator("json", AdminEnginesModel.UpdateBody),

	async (c) => {
		const row = engineOf(c);
		const body = c.req.valid("json") as AdminEnginesModel.UpdateBody;
		const definition = SearchEngineRegistry.get(row.engine_type)?.definition;
		const checked = await validate(definition, body, row.settings);
		if ("error" in checked) return APIResponse.badRequest(c, checked.error);

		if (body.slug && body.slug !== row.slug) {
			const clash = await DB.instance()
				.select()
				.from(DB.Tables.searchEngines)
				.where(eq(DB.Tables.searchEngines.slug, body.slug))
				.get();
			if (clash) return APIResponse.conflict(c, "An engine with this slug already exists");
		}

		const updated = await DB.instance()
			.update(DB.Tables.searchEngines)
			.set({ ...body, settings: checked.settings })
			.where(eq(DB.Tables.searchEngines.id, row.id))
			.returning()
			.get();
		await afterChange();
		return APIResponse.success(c, "Engine updated", toModel(updated));
	},
);

router.delete(
	"/:engineID",

	APIRouteSpec.authenticated({
		summary: "Delete engine",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Engine deleted"),
			APIResponseSpec.notFound("Engine not found"),
		),
	}),

	async (c) => {
		const row = engineOf(c);
		await DB.instance()
			.delete(DB.Tables.searchEngines)
			.where(eq(DB.Tables.searchEngines.id, row.id))
			.run();
		EngineHealth.reset(row.slug);
		await afterChange();
		return APIResponse.successNoData(c, "Engine deleted");
	},
);

router.post(
	"/:engineID/test",

	APIRouteSpec.authenticated({
		summary: "Test engine",
		description:
			"Run a query against this engine only (also works while it is disabled) and clear its suspension on success.",
		tags: [DOCS_TAGS.ADMIN_API.ENGINES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Engine tested", AdminEnginesModel.TestResponse),
			APIResponseSpec.notFound("Engine not found"),
		),
	}),

	zValidator("json", AdminEnginesModel.TestBody),

	async (c) => {
		const row = engineOf(c);
		const body = c.req.valid("json") as AdminEnginesModel.TestBody;

		let engine: SearchEngine;
		try {
			engine = SearchEngineManager.instantiate(row);
		} catch (err) {
			return APIResponse.success(c, "Engine tested", {
				ok: false,
				status: "error",
				time_ms: 0,
				results: 0,
				error: (err as Error).message,
				sample: [],
			} satisfies AdminEnginesModel.TestResponse);
		}

		// A manual test should not be refused because of an earlier suspension.
		EngineHealth.reset(row.slug);
		const outcome = await SearchAggregator.run(
			{
				query: body.query,
				category: body.category ?? engine.config.categories[0] ?? "general",
				page: 1,
				language: "all",
				safesearch: 1,
				timeRange: null,
			},
			[engine],
		);
		const status = outcome.engines[0]!;
		return APIResponse.success(c, "Engine tested", {
			ok: status.status === "ok",
			status: status.status,
			time_ms: status.time_ms,
			results: status.results,
			error: status.error,
			sample: outcome.results.slice(0, 5),
		} satisfies AdminEnginesModel.TestResponse);
	},
);
