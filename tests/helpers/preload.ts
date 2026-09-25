/// <reference types="bun-types" />

import fs from "fs/promises";
import path from "path";
import { afterAll, beforeAll } from "bun:test";
import { ConfigHandler, type ENVConfigLike } from "../../server/lib/utils/config";
import { DB } from "../../server/lib/db";
import { API } from "../../server/lib/api";
import { Utils } from "../../server/lib/utils";

function setTestEnv(rootDir: string) {
	const envVars = {
		APPPREFIX_LOG_LEVEL: "debug",

		APPPREFIX_API_DISABLE_DOCS: false,

		APPPREFIX_DB_PATH: path.join(rootDir, "db.sqlite"),
		APPPREFIX_DB_AUTO_MIGRATE: true,

		APPPREFIX_LOG_DIR: path.join(rootDir, "logs"),
		APPPREFIX_CONFIG_BASE_DIR: rootDir,

		APPPREFIX_APP_URL: "http://localhost:12520",

		APPPREFIX_SMTP_HOST: "127.0.0.1",
		APPPREFIX_SMTP_PORT: 12587,
		APPPREFIX_SMTP_USERNAME: "",
		APPPREFIX_SMTP_PASSWORD: "",
		APPPREFIX_SMTP_FROM: '"App Test" <test@app.local>',
		APPPREFIX_SMTP_SECURE: false,
	} as const satisfies ENVConfigLike;

	for (const [key, value] of Object.entries(envVars)) {
		process.env[key] = String(value);
	}
}

async function createIsolatedDataDir(): Promise<string> {
	const root = await fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
	return root;
}

async function runCommand(cmd: string[]) {
	const process = Bun.spawn({
		cmd,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		process.stdout ? new Response(process.stdout).text() : Promise.resolve(""),
		process.stderr ? new Response(process.stderr).text() : Promise.resolve(""),
		process.exited,
	]);

	if (exitCode !== 0) {
		throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr || stdout}`.trim());
	}
}

/**
 * On Windows, file handles (e.g. the SQLite DB file) can take a moment to be
 * released after closing, making an immediate recursive removal flaky (EBUSY).
 * Retries manually since Bun's `fs.rm` doesn't reliably honor `maxRetries`/`retryDelay`.
 */
async function removeDirWithRetry(dir: string, attempts = 10, delayMs = 300) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await fs.rm(dir, { recursive: true, force: true });
			return;
		} catch (err: any) {
			if (
				attempt === attempts ||
				(err?.code !== "EBUSY" && err?.code !== "ENOTEMPTY" && err?.code !== "EPERM")
			) {
				console.error(`Failed to remove directory ${dir} on attempt ${attempt}:`, err);
			}
			await Bun.sleep(delayMs);
		}
	}
}

let TMP_ROOT: string | null = null;

beforeAll(async () => {
	TMP_ROOT = await createIsolatedDataDir();

	setTestEnv(TMP_ROOT);

	const config = await ConfigHandler.loadConfig();

	await DB.init(path.join(TMP_ROOT, "db.sqlite"), true, TMP_ROOT);

	// EmailService is NOT initialised here — tests that need it call
	// EmailService.init(mockTransport) in their own beforeAll.

	await API.init([config.APP_URL], false);

	// await API.start(12521, "::");
});

afterAll(async () => {
	await API.stop();

	await DB.close();

	if (TMP_ROOT) {
		await removeDirWithRetry(TMP_ROOT);
	}
});
