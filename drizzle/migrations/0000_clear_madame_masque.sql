CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`hashed_token` text NOT NULL,
	`user_id` integer NOT NULL,
	`user_role` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bangs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` integer,
	`trigger` text NOT NULL,
	`name` text NOT NULL,
	`url_template` text NOT NULL,
	`category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bangs_trigger_idx` ON `bangs` (`trigger`);--> statement-breakpoint
CREATE TABLE `ddg_bangs` (
	`trigger` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`url_template` text NOT NULL,
	`category` text,
	`subcategory` text,
	`relevance` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proxies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`proxy_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`function` text NOT NULL,
	`created_by_user_id` integer,
	`args` text NOT NULL,
	`autoDelete` integer DEFAULT 0 NOT NULL,
	`storeLogs` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`result` text,
	`message` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks_paused_state` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`next_step_to_execute` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `scheduled_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_engines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`engine_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`categories` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`timeout_ms` integer DEFAULT 4000 NOT NULL,
	`proxy_ids` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_engines_slug_unique` ON `search_engines` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`hashed_token` text NOT NULL,
	`user_id` integer NOT NULL,
	`user_role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_user_id_key_unique` ON `user_preferences` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);