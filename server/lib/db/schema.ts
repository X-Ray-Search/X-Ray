import type { TaskHandler } from "@cleverjs/utils";
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { UserAccountSettings } from "../api/utils/shared-models/accountData";
import type { SearchTypes } from "../search/types";
import { SQLUtils } from "./utils";

/**
 * @deprecated Use DB.Tables.users to access this table.
 */
export const users = sqliteTable("users", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),

	username: text().notNull().unique(),
	display_name: text().notNull(),
	email: text().notNull().unique(),
	password_hash: text().notNull(),

	role: text({
		enum: UserAccountSettings.Roles,
	})
		.default("user")
		.notNull(),

	created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * @deprecated Use DB.Tables.passwordResets to access this table.
 */
export const passwordResets = sqliteTable("password_resets", {
	token: text().primaryKey(),
	user_id: integer()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	created_at: SQLUtils.getCreatedAtColumn(),
	expires_at: integer().notNull(),
});

/**
 * @deprecated Use DB.Tables.sessions to access this table.
 */
export const sessions = sqliteTable("sessions", {
	id: text().primaryKey(),
	hashed_token: text().notNull(),
	user_id: integer()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// we cache user role here for easier permission checking without having to join the users table, and we will check the role in users table on every update to make sure it's still valid
	user_role: text({
		enum: UserAccountSettings.Roles,
	}).notNull(),
	created_at: SQLUtils.getCreatedAtColumn(),
	expires_at: integer().notNull(),
});

/**
 * @deprecated Use DB.Tables.apiKeys to access this table.
 */
export const apiKeys = sqliteTable("api_keys", {
	id: text().primaryKey(),
	hashed_token: text().notNull(),
	user_id: integer()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// we cache user role here for easier permission checking without having to join the users table, and we will check the role in users table on every update to make sure it's still valid
	user_role: text({
		enum: UserAccountSettings.Roles,
	}).notNull(),
	description: text().notNull(),
	created_at: SQLUtils.getCreatedAtColumn(),
	expires_at: integer(),
});

/**
 * @deprecated Use DB.Tables.userPreferences to access this table.
 */
export const userPreferences = sqliteTable(
	"user_preferences",
	{
		id: SQLUtils.primaryKeyIntAutoIncrement("id"),
		user_id: integer()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		created_at: SQLUtils.getCreatedAtColumn(),

		// Preference key, e.g. "remote-content-policy".
		key: text().notNull(),
		data: text({ mode: "json" }).$type<Record<string, any> | Array<any>>().notNull(),
	},
	(table) => [uniqueIndex("user_preferences_user_id_key_unique").on(table.user_id, table.key)],
);

/**
 * @deprecated Use DB.Tables.scheduled_tasks to access this table.
 */
export const scheduled_tasks = sqliteTable("scheduled_tasks", {
	id: integer().primaryKey({ autoIncrement: true }),
	function: text().notNull(),
	created_by_user_id: integer().references(() => users.id, { onDelete: "set null" }),
	args: text({ mode: "json" }).$type<Record<string, any>>().notNull(),
	autoDelete: integer({ mode: "boolean" }).notNull().default(sql`0`),
	storeLogs: integer({ mode: "boolean" }).notNull().default(sql`0`),
	status: text({ enum: ["pending", "running", "paused", "failed", "completed"] })
		.notNull()
		.default("pending"),
	created_at: integer().notNull(),
	finished_at: integer(),
	result: text({ mode: "json" }).$type<Record<string, any>>(),
	message: text(),
});

/**
 * @deprecated Use DB.Tables.scheduled_tasks_paused_state to access this table.
 */
export const scheduled_tasks_paused_state = sqliteTable("scheduled_tasks_paused_state", {
	task_id: integer()
		.primaryKey()
		.references(() => scheduled_tasks.id, { onDelete: "cascade" }),
	next_step_to_execute: integer().notNull(),
	data: text({ mode: "json" }).$type<TaskHandler.TempPausedTaskState["data"]>().notNull(),
});

/**
 * @deprecated Use DB.Tables.metadata to access this table.
 */
export const metadata = sqliteTable("metadata", {
	key: text().primaryKey(),
	data: text({ mode: "json" }).$type<Record<string, any> | Array<any>>().notNull(),
});

/**
 * A configured search backend. `engine_type` points at a registered `SearchEngine` class;
 * `settings` is validated against that class's settings schema.
 *
 * @deprecated Use DB.Tables.searchEngines to access this table.
 */
export const searchEngines = sqliteTable("search_engines", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),
	// Stable identifier used in the API, the `engines=` query param and result attribution.
	slug: text().notNull().unique(),
	name: text().notNull(),
	engine_type: text().notNull(),
	enabled: integer({ mode: "boolean" }).notNull().default(true),
	categories: text({ mode: "json" }).$type<SearchTypes.Category[]>().notNull(),
	weight: real().notNull().default(1),
	timeout_ms: integer().notNull().default(4000),
	// Proxies to route this engine through (round-robin). Empty → instance default proxies.
	proxy_ids: text({ mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
	settings: text({ mode: "json" }).$type<Record<string, any>>().notNull().default(sql`'{}'`),
	created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * An outbound proxy. `proxy_type` points at a registered `ProxyTransport` class.
 *
 * @deprecated Use DB.Tables.proxies to access this table.
 */
export const proxies = sqliteTable("proxies", {
	id: SQLUtils.primaryKeyIntAutoIncrement("id"),
	name: text().notNull(),
	proxy_type: text().notNull(),
	enabled: integer({ mode: "boolean" }).notNull().default(true),
	settings: text({ mode: "json" }).$type<Record<string, any>>().notNull().default(sql`'{}'`),
	created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * Custom bangs. `owner_user_id = NULL` means instance-wide (managed by admins).
 *
 * @deprecated Use DB.Tables.bangs to access this table.
 */
export const bangs = sqliteTable(
	"bangs",
	{
		id: SQLUtils.primaryKeyIntAutoIncrement("id"),
		owner_user_id: integer().references(() => users.id, { onDelete: "cascade" }),
		trigger: text().notNull(),
		name: text().notNull(),
		// Target URL with `{{{s}}}` (or `%s`) as the query placeholder.
		url_template: text().notNull(),
		category: text(),
		created_at: SQLUtils.getCreatedAtColumn(),
	},
	(table) => [index("bangs_trigger_idx").on(table.trigger)],
);

/**
 * Local copy of the DuckDuckGo bang dataset (https://duckduckgo.com/bang.js).
 *
 * @deprecated Use DB.Tables.ddgBangs to access this table.
 */
export const ddgBangs = sqliteTable("ddg_bangs", {
	trigger: text().primaryKey(),
	name: text().notNull(),
	domain: text().notNull(),
	url_template: text().notNull(),
	category: text(),
	subcategory: text(),
	relevance: integer().notNull().default(0),
});
