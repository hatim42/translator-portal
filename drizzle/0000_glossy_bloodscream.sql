CREATE TABLE `app_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`translator_id` integer,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_translator_unique` ON `app_users` (`translator_id`);--> statement-breakpoint
CREATE INDEX `idx_app_users_role` ON `app_users` (`role`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translator_id` integer NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_translator_time` ON `attendance` (`translator_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translator_id` integer NOT NULL,
	`work_date` text NOT NULL,
	`beneficiaries` integer NOT NULL,
	`sessions` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_stats_translator_date` ON `daily_stats` (`translator_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_daily_stats_work_date` ON `daily_stats` (`work_date`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`translator_id` integer PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translator_id` integer NOT NULL,
	`cycle` text NOT NULL,
	`preferred_shift` text NOT NULL,
	`preferred_rest` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_preferences_translator_cycle` ON `preferences` (`translator_id`,`cycle`);--> statement-breakpoint
CREATE INDEX `idx_preferences_cycle` ON `preferences` (`cycle`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translator_id` integer NOT NULL,
	`type` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`requested_value` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requests_status_created` ON `requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_requests_translator_created` ON `requests` (`translator_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`translator_id` integer NOT NULL,
	`cycle` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`translator_id`) REFERENCES `translators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rewards_translator_cycle` ON `rewards` (`translator_id`,`cycle`);--> statement-breakpoint
CREATE TABLE `translators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`group_name` text NOT NULL,
	`language_group` text NOT NULL,
	`primary_language` text NOT NULL,
	`shift` text NOT NULL,
	`rest_day` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translators_username_unique` ON `translators` (`username`);--> statement-breakpoint
CREATE INDEX `idx_translators_language_group` ON `translators` (`language_group`);--> statement-breakpoint
CREATE INDEX `idx_translators_group_name` ON `translators` (`group_name`);