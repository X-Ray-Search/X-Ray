import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { z } from "zod";
import { DB } from "../../../../../../db";
import { ProxyManager } from "../../../../../../proxy";
import { ProxyTransportRegistry } from "../../../../../../proxy/transports";
import { SearchEngineManager } from "../../../../../../search/manager";
import { SettingsHandler } from "../../../../../../settings";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { DOCS_TAGS } from "../../../docs";
import { AdminProxiesModel } from "./model";

export const router = new Hono().basePath("/proxies");

const PROXY_KEY = "adminProxy";

async function toModels(rows: DB.Models.Proxy[]): Promise<AdminProxiesModel.Proxy[]> {
	const [engines, settings] = await Promise.all([
		DB.instance().select().from(DB.Tables.searchEngines).all(),
		SettingsHandler.getInstance(),
	]);
	return rows.map((row) => ({
		...row,
		...ProxyManager.toPublicSettings(row.proxy_type, row.settings),
		used_by_engines: engines.filter((e) => e.proxy_ids.includes(row.id)).map((e) => e.slug),
		is_default: settings.default_proxy_ids.includes(row.id),
	}));
}

/** Validate settings against the proxy type; secret fields sent empty keep their stored value. */
function validateSettings(type: string, settings: Record<string, any> | undefined, previous: Record<string, any> = {}) {
	const cls = ProxyTransportRegistry.get(type);
	if (!cls) return { error: "Unknown proxy type" } as const;
	const merged = { ...previous, ...settings };
	for (const field of cls.definition.secretFields ?? []) {
		if (settings && (settings[field] === undefined || settings[field] === "")) merged[field] = previous[field];
	}
	const parsed = cls.definition.settings.safeParse(merged);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return { error: `Invalid settings${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message}` } as const;
	}
	return { settings: parsed.data as Record<string, any> } as const;
}

async function afterChange() {
	await ProxyManager.reload();
}

router.get(
	"/types",

	APIRouteSpec.authenticated({
		summary: "List proxy types",
		description: "All registered proxy transports with their settings JSON Schema.",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Proxy types retrieved", AdminProxiesModel.ProxyType.array()),
		),
	}),

	async (c) =>
		APIResponse.success(
			c,
			"Proxy types retrieved",
			ProxyTransportRegistry.list().map(({ definition }) => ({
				type: definition.type,
				name: definition.name,
				description: definition.description,
				settings_schema: z.toJSONSchema(definition.settings, { io: "input" }) as Record<string, any>,
				default_settings: definition.settings.safeParse({}).data ?? {},
				secret_fields: [...(definition.secretFields ?? [])],
			})),
		),
);

router.post(
	"/test",

	APIRouteSpec.authenticated({
		summary: "Test an unsaved proxy configuration",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Proxy tested", AdminProxiesModel.TestResponse),
		),
	}),

	zValidator("json", AdminProxiesModel.TestConfigBody),

	async (c) => {
		const body = c.req.valid("json") as AdminProxiesModel.TestConfigBody;
		const checked = validateSettings(body.proxy_type, body.settings);
		if ("error" in checked) return APIResponse.badRequest(c, checked.error!);
		const transport = ProxyManager.instantiate({ id: 0, name: "test", proxy_type: body.proxy_type, settings: checked.settings });
		try {
			return APIResponse.success(c, "Proxy tested", await transport.test());
		} finally {
			await transport.close();
		}
	},
);

router.get(
	"/",

	APIRouteSpec.authenticated({
		summary: "List proxies",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Proxies retrieved", AdminProxiesModel.Proxy.array()),
		),
	}),

	async (c) => {
		const rows = await DB.instance().select().from(DB.Tables.proxies).orderBy(DB.Tables.proxies.id).all();
		return APIResponse.success(c, "Proxies retrieved", await toModels(rows));
	},
);

router.post(
	"/",

	APIRouteSpec.authenticated({
		summary: "Create proxy",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeWithWrongInputs(APIResponseSpec.created("Proxy created", AdminProxiesModel.Proxy)),
	}),

	zValidator("json", AdminProxiesModel.Body),

	async (c) => {
		const body = c.req.valid("json") as AdminProxiesModel.Body;
		const checked = validateSettings(body.proxy_type, body.settings);
		if ("error" in checked) return APIResponse.badRequest(c, checked.error!);
		const row = await DB.instance()
			.insert(DB.Tables.proxies)
			.values({ ...body, settings: checked.settings })
			.returning()
			.get();
		await afterChange();
		return APIResponse.created(c, "Proxy created", (await toModels([row]))[0]!);
	},
);

router.use(
	"/:proxyID/*",

	zValidator("param", AdminProxiesModel.Params),

	async (c, next) => {
		// @ts-ignore
		const { proxyID } = c.req.valid("param") as AdminProxiesModel.Params;
		const row = await DB.instance().select().from(DB.Tables.proxies).where(eq(DB.Tables.proxies.id, proxyID)).get();
		if (!row) return APIResponse.notFound(c, "Proxy not found");
		// @ts-ignore
		c.set(PROXY_KEY, row);
		await next();
	},
);

function proxyOf(c: Context) {
	// @ts-ignore
	return c.get(PROXY_KEY) as DB.Models.Proxy;
}

router.get(
	"/:proxyID",

	APIRouteSpec.authenticated({
		summary: "Get proxy",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Proxy retrieved", AdminProxiesModel.Proxy),
			APIResponseSpec.notFound("Proxy not found"),
		),
	}),

	async (c) => APIResponse.success(c, "Proxy retrieved", (await toModels([proxyOf(c)]))[0]!),
);

router.put(
	"/:proxyID",

	APIRouteSpec.authenticated({
		summary: "Update proxy",
		description: "Partial update. Secret settings sent empty keep their stored value.",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeWithWrongInputs(
			APIResponseSpec.success("Proxy updated", AdminProxiesModel.Proxy),
			APIResponseSpec.notFound("Proxy not found"),
		),
	}),

	zValidator("json", AdminProxiesModel.UpdateBody),

	async (c) => {
		const row = proxyOf(c);
		const body = c.req.valid("json") as AdminProxiesModel.UpdateBody;
		const checked = validateSettings(row.proxy_type, body.settings, row.settings);
		if ("error" in checked) return APIResponse.badRequest(c, checked.error!);
		const updated = await DB.instance()
			.update(DB.Tables.proxies)
			.set({ ...body, settings: checked.settings })
			.where(eq(DB.Tables.proxies.id, row.id))
			.returning()
			.get();
		await afterChange();
		return APIResponse.success(c, "Proxy updated", (await toModels([updated]))[0]!);
	},
);

router.delete(
	"/:proxyID",

	APIRouteSpec.authenticated({
		summary: "Delete proxy",
		description: "Deletes the proxy and removes it from every engine and the instance default list.",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.successNoData("Proxy deleted"),
			APIResponseSpec.notFound("Proxy not found"),
		),
	}),

	async (c) => {
		const row = proxyOf(c);
		const engines = await DB.instance().select().from(DB.Tables.searchEngines).all();
		await DB.instance().transaction(async (tx) => {
			for (const engine of engines.filter((e) => e.proxy_ids.includes(row.id))) {
				await tx
					.update(DB.Tables.searchEngines)
					.set({ proxy_ids: engine.proxy_ids.filter((id) => id !== row.id) })
					.where(eq(DB.Tables.searchEngines.id, engine.id));
			}
			await tx.delete(DB.Tables.proxies).where(eq(DB.Tables.proxies.id, row.id));
		});

		const settings = await SettingsHandler.getInstance();
		if (settings.default_proxy_ids.includes(row.id)) {
			await SettingsHandler.updateInstance({ default_proxy_ids: settings.default_proxy_ids.filter((id) => id !== row.id) });
		}
		await afterChange();
		await SearchEngineManager.reload();
		return APIResponse.successNoData(c, "Proxy deleted");
	},
);

router.post(
	"/:proxyID/test",

	APIRouteSpec.authenticated({
		summary: "Test proxy",
		description: "Fetch a probe URL through the proxy and report latency and the exit IP.",
		tags: [DOCS_TAGS.ADMIN_API.PROXIES],
		responses: APIResponseSpec.describeBasic(
			APIResponseSpec.success("Proxy tested", AdminProxiesModel.TestResponse),
			APIResponseSpec.notFound("Proxy not found"),
		),
	}),

	async (c) => {
		const row = proxyOf(c);
		let transport: ReturnType<typeof ProxyManager.instantiate>;
		try {
			transport = ProxyManager.instantiate(row);
		} catch (err) {
			return APIResponse.success(c, "Proxy tested", {
				ok: false,
				latency_ms: 0,
				status: null,
				ip: null,
				error: (err as Error).message,
			});
		}
		try {
			return APIResponse.success(c, "Proxy tested", await transport.test());
		} finally {
			await transport.close();
		}
	},
);
