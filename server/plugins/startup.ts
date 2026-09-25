import { defineNitroPlugin } from "nitropack/runtime";
import { ConfigHandler } from "../lib/utils/config";
import { Logger } from "../lib/utils/logger";
import { DB } from "../lib/db";
import { API } from "../lib/api";
import { AppConstants } from "../lib/utils/constants";
import { Utils } from "../lib/utils";
import { CronJobHandler } from "../lib/utils/cron";
import { EmailService } from "../lib/api/utils/email";
import { TaskScheduler } from "../lib/tasks";

// Runs once at Nitro boot — replaces Main.main() from the standalone backend shape.
export default defineNitroPlugin(async (nitroApp) => {

	const config = await ConfigHandler.loadConfig();

	Logger.setLogLevel(config.LOG_LEVEL ?? "info");
	Logger.log(`Starting ${AppConstants.APP_NAME}...`);

	await DB.init(config.DB_PATH, config.DB_AUTO_MIGRATE, config.CONFIG_BASE_DIR);

	await Utils.ensureDirectoryExists(config.LOG_DIR ?? "./data/logs");

	await TaskScheduler.processQueue();

	await EmailService.init();

	await CronJobHandler.init();
	await CronJobHandler.startAll();

	await API.init([config.APP_URL], config.API_DISABLE_DOCS === true);


	nitroApp.hooks.hook("close", async () => {
		try {
			Logger.log(`Received SIGTERM, shutting down...`);

			await CronJobHandler.stopAll();

			await API.stop();

			await EmailService.reset();
			await TaskScheduler.stopProcessing();

			await DB.close();

			Logger.log("Shutdown complete, exiting.");
		} catch {
			Logger.critical("Error during shutdown, forcing exit");
		}
	});
});