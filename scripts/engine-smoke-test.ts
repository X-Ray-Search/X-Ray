/**
 * Live smoke test for the built-in search engines — hits the real services.
 *
 *   bun scripts/engine-smoke-test.ts                 # every engine that needs no config
 *   bun scripts/engine-smoke-test.ts "rust lang" bing duckduckgo_images
 *
 * Uses a throwaway in-memory database and direct connections. Scrapers break when engines
 * change their markup; run this to see which ones need attention.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "xray-smoke-"));
process.env.XRAY_APP_URL ??= "http://localhost:12418";
process.env.XRAY_LOG_LEVEL ??= "warn";

const { ConfigHandler } = await import("../server/lib/utils/config");
const { Logger } = await import("../server/lib/utils/logger");
const { DB } = await import("../server/lib/db");
const { SearchEngineRegistry } = await import("../server/lib/search/engines");
const { SearchEngineManager } = await import("../server/lib/search/manager");
const { SearchAggregator } = await import("../server/lib/search/aggregator");

await ConfigHandler.loadConfig();
Logger.setLogLevel("warn");
await DB.init(join(dir, "db.sqlite"), true, dir);

const [query = "linux kernel", ...only] = process.argv.slice(2);
const types = SearchEngineRegistry.list()
	.map((cls) => cls.definition)
	.filter((d) => (only.length ? only.includes(d.type) : !d.requiresConfiguration));

let failures = 0;
for (const definition of types) {
	for (const category of definition.categories) {
		const engine = SearchEngineManager.instantiate({
			id: 0,
			slug: definition.type,
			name: definition.name,
			engine_type: definition.type,
			categories: [category],
			weight: 1,
			timeout_ms: 8000,
			proxy_ids: [],
			settings: {},
		});
		const outcome = await SearchAggregator.run(
			{ query, category, page: 1, language: "en-US", safesearch: 1, timeRange: null },
			[engine],
		);
		const status = outcome.engines[0]!;
		const first = outcome.results[0];
		if (status.status !== "ok" || status.results === 0) failures++;
		console.log(
			`${status.status === "ok" && status.results ? "✔" : "✘"} ${definition.type.padEnd(18)} ${category.padEnd(8)} ${String(status.results).padStart(3)} results ${String(status.time_ms).padStart(5)}ms  ${status.error ?? first?.title?.slice(0, 60) ?? ""}`,
		);
	}
}

await DB.close();
rmSync(dir, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
