import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdir as fs_mkdir } from "fs/promises";
import { dirname as path_dirname, join as path_join } from "path";
import { ConfigHandler } from "../utils/config";
import { AppConstants } from "../utils/constants";
import { LCrypt } from "../utils/crypto/lcrypt";
import { Logger } from "../utils/logger";
import * as TableSchema from "./schema";
import type { DrizzleDB } from "./utils";

export class DB {
	protected static db: DrizzleDB.BunSQLite;

	static async init(path: string, autoMigrate: boolean, configBaseDir: string) {
		await fs_mkdir(path_dirname(path), { recursive: true });
		await fs_mkdir(configBaseDir, { recursive: true });

		this.db = drizzle(path);
		if (autoMigrate) {
			Logger.info("Running database migrations...");

			let migrationsFolder = "drizzle/migrations";
			if (Bun?.isStandaloneExecutable) {
				migrationsFolder = path_join(import.meta.dir, migrationsFolder);
			}

			await migrate(this.db, { migrationsFolder });

			Logger.info("Database migrations completed.");
		}

		await this.createInitialAdminUserIfNeeded(configBaseDir);

		Logger.info(`Database initialized at ${path}`);
	}

	private static async createInitialAdminUserIfNeeded(configBaseDir: string) {
		const usersTableEmpty = (await this.db.select().from(DB.Tables.users).limit(1)).length === 0;
		if (!usersTableEmpty) return;

		const username = "admin";

		const admin_user_id = await this.db
			.insert(DB.Tables.users)
			.values({
				username,
				email: `${username}@${AppConstants.DEFAULT_EMAIL_FROM_HOST}`,
				password_hash: await Bun.password.hash(LCrypt.randomBytes(32).toString("hex")),
				display_name: "Default Administrator",
				role: "admin",
			})
			.returning()
			.get().id;

		const passwordResetToken = LCrypt.randomBytes(64).toString("hex");

		await this.db.insert(DB.Tables.passwordResets).values({
			token: LCrypt.sha256(passwordResetToken).toHex(),
			user_id: admin_user_id,
			expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 Days
		});

		// APP_URL is a required config value; the fallback only covers the
		// impossible-after-loadConfig undefined case so the token file is still usable.
		const APP_URL = ConfigHandler.getConfig()?.APP_URL || "https://<app-url>";

		await Bun.write(
			`${configBaseDir}/initial_admin_password_reset_token.txt`,
			`${APP_URL}/auth/reset-password?token=${passwordResetToken}`,
			{
				mode: 0o600,
				createPath: true,
			},
		);

		Logger.info(
			`Initial admin user created with username: ${username}.\n` +
				`You can set the password under ${APP_URL}/auth/reset-password?token=${passwordResetToken}\n` +
				`The url is also saved at ${configBaseDir}/initial_admin_password_reset_token.txt\n`,
		);

		return admin_user_id;
	}

	static instance() {
		if (!this.db) {
			throw new Error("Database not initialized. Call DB.init() first.");
		}
		return DB.db;
	}

	static async close() {
		if (!this.db) return;

		Logger.info("Database connection closed.");
		await this.db.$client.close();

		// `close()` calls sqlite3_close_v2, which defers releasing the OS file
		// handle until any unfinalized prepared statements are garbage collected.
		// Force that now so the underlying file is actually free (e.g. for tests
		// that remove the DB file/directory right after closing).
		Bun.gc(true);
		await Bun.sleep(500);
	}
}

export namespace DB.Tables {
	export const users = TableSchema.users;
	export const sessions = TableSchema.sessions;
	export const passwordResets = TableSchema.passwordResets;
	export const apiKeys = TableSchema.apiKeys;

	export const userPreferences = TableSchema.userPreferences;

	export const scheduled_tasks = TableSchema.scheduled_tasks;
	export const scheduled_tasks_paused_state = TableSchema.scheduled_tasks_paused_state;

	export const metadata = TableSchema.metadata;

	export const searchEngines = TableSchema.searchEngines;
	export const proxies = TableSchema.proxies;
	export const bangs = TableSchema.bangs;
	export const ddgBangs = TableSchema.ddgBangs;

	export const aiChats = TableSchema.aiChats;
	export const aiChatMessages = TableSchema.aiChatMessages;
}

export namespace DB.Models {
	export type User = typeof DB.Tables.users.$inferSelect;
	export type Session = typeof DB.Tables.sessions.$inferSelect;
	export type PasswordReset = typeof DB.Tables.passwordResets.$inferSelect;
	export type ApiKey = typeof DB.Tables.apiKeys.$inferSelect;

	export type UserPreference = typeof DB.Tables.userPreferences.$inferSelect;

	export type ScheduledTask = typeof DB.Tables.scheduled_tasks.$inferSelect;
	export type ScheduledTaskPausedState = typeof DB.Tables.scheduled_tasks_paused_state.$inferSelect;

	export type Metadata = typeof DB.Tables.metadata.$inferSelect;

	export type SearchEngine = typeof DB.Tables.searchEngines.$inferSelect;
	export type Proxy = typeof DB.Tables.proxies.$inferSelect;
	export type Bang = typeof DB.Tables.bangs.$inferSelect;
	export type DDGBang = typeof DB.Tables.ddgBangs.$inferSelect;

	export type AIChat = typeof DB.Tables.aiChats.$inferSelect;
	export type AIChatMessage = typeof DB.Tables.aiChatMessages.$inferSelect;
}
