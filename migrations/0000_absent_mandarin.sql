CREATE TABLE `saves` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`slot` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	`data` json NOT NULL,
	`schema_version` int NOT NULL DEFAULT 1,
	`playtime_ms` bigint unsigned NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saves_id` PRIMARY KEY(`id`),
	CONSTRAINT `saves_user_slot_unique` UNIQUE(`user_id`,`slot`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` timestamp NOT NULL,
	`user_agent` varchar(255),
	`ip` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(32) NOT NULL,
	`username_lc` varchar(32) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_login_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_lc_unique` UNIQUE(`username_lc`)
);
--> statement-breakpoint
CREATE INDEX `saves_user_ix` ON `saves` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_ix` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_ix` ON `sessions` (`expires_at`);