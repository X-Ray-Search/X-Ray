import type { CronJob as BunCronJob } from "bun";

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
			new CronJob("* * * * *", async () => {
				// do something every minute
			}),

			new CronJob("* * * * *", async () => {
				// do something every minute
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
