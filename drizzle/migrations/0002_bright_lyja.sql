ALTER TABLE `search_engines` ADD `fallback` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `search_engines` ADD `rate_limit_per_minute` integer DEFAULT 0 NOT NULL;