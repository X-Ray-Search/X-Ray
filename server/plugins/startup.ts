import { defineNitroPlugin } from "nitropack/runtime";
import { API } from "../lib/api";
import { EmailService } from "../lib/api/utils/email";
import { BangService } from "../lib/bangs";
import { BangDataset } from "../lib/bangs/dataset";
import { DB } from "../lib/db";
import { ProxyManager } from "../lib/proxy";
import { SearchEngineManager } from "../lib/search/manager";
import { TaskScheduler } from "../lib/tasks";
import { Utils } from "../lib/utils";
import { ConfigHandler } from "../lib/utils/config";
import { AppConstants } from "../lib/utils/constants";
import { CronJobHandler } from "../lib/utils/cron";
import { Logger } from "../lib/utils/logger";

// Runs once at Nitro boot — replaces Main.main() from the standalone backend shape.
export default defineNitroPlugin(async (nitroApp) => {
	const config = await ConfigHandler.loadConfig();

	Logger.setLogLevel(config.LOG_LEVEL ?? "info");
	Logger.log(`Starting ${AppConstants.APP_NAME} ${AppConstants.APP_VERSION}...`);

	await DB.init(config.DB_PATH, config.DB_AUTO_MIGRATE, config.CONFIG_BASE_DIR);

	await Utils.ensureDirectoryExists(config.LOG_DIR ?? "./data/logs");

	await TaskScheduler.processQueue();

	await EmailService.init();

	// Search domain: default engines on first boot, then load engines, proxies and bangs.
	await SearchEngineManager.seedDefaultsIfEmpty();
	await ProxyManager.reload();
	await SearchEngineManager.reload();
	await BangService.load();

	if (!config.BANGS_DISABLE_AUTO_FETCH) {
		// Fetch the DuckDuckGo bang dataset in the background — search works without it.
		BangDataset.refreshIfStale().catch((err) =>
			Logger.warn("Initial bang dataset refresh failed:", (err as Error).message),
		);
	}

	await CronJobHandler.init();
	await CronJobHandler.startAll();

	await API.init([config.APP_URL], config.API_DISABLE_DOCS === true);

	nitroApp.hooks.hook("close", async () => {
		try {
			Logger.log("Received SIGTERM, shutting down...");

			await CronJobHandler.stopAll();

			await API.stop();

			await EmailService.reset();
			await TaskScheduler.stopProcessing();

			await ProxyManager.closeAll();

			await DB.close();

			Logger.log("Shutdown complete, exiting.");
		} catch {
			Logger.critical("Error during shutdown, forcing exit");
		}
	});
});
