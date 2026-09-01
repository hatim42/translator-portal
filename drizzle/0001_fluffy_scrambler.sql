CREATE TABLE `login_attempts` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`last_attempt_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_portal_sessions_user` ON `portal_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_portal_sessions_expiry` ON `portal_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `translator_credentials` (
	`translator_id` integer PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
