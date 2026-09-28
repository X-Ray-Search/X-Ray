import type { CronJob as BunCronJob } from "bun";
import { BangDataset } from "../bangs/dataset";
import { SearchService } from "../search/service";
import { ConfigHandler } from "./config";
import { Logger } from "./logger";

class CronJob {
	private _job: BunCronJob | null = null;

	constructor(
		private readonly cronExpression: string,
		private readonly callback: () => Promise<void>,
	) {}

	start() {
		this._job = Bun.cron(this.cronExpression, this.callback);
	}

	async stop() {
		if (this._job) {
			await this._job.stop();
		}
	}
}

export class CronJobHandler {
	private static jobs: CronJob[] = [];
	private static initialized: boolean = false;

	static async init() {
		if (this.initialized) return;
		this.initialized = true;

		this.jobs.push(
			// Drop expired search result pages.
			new CronJob("*/5 * * * *", async () => {
				SearchService.pruneCache();
			}),

			// Keep the DuckDuckGo bang dataset fresh (respects the auto-update setting/interval).
			new CronJob("17 * * * *", async () => {
				if (ConfigHandler.getConfig()?.BANGS_DISABLE_AUTO_FETCH) return;
				try {
					await BangDataset.refreshIfStale();
				} catch (err) {
					Logger.warn("Scheduled bang dataset refresh failed:", (err as Error).message);
				}
			}),
		);
	}

	static async startAll() {
		if (!this.initialized) {
			await this.init();
		}
		for (const job of this.jobs) {
			job.start();
		}
	}

	static async stopAll() {
		for (const job of this.jobs) {
			await job.stop();
		}
	}
}
