CREATE TABLE `auth_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`event` enum('register','login','logout','failed_login','password_change') NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`meta` json,
	`ts` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `auth_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `character_map_states` (
	`character_id` bigint unsigned NOT NULL,
	`map_id` varchar(64) NOT NULL,
	`state` json NOT NULL,
	`schema_version` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `character_map_states_char_map_unique` UNIQUE(`character_id`,`map_id`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`slot` varchar(32) NOT NULL DEFAULT 'main',
	`snapshot` json NOT NULL,
	`current_map_id` varchar(64) NOT NULL,
	`job_id` varchar(32) NOT NULL,
	`base_level` int NOT NULL DEFAULT 1,
	`job_level` int NOT NULL DEFAULT 1,
	`zeny` bigint NOT NULL DEFAULT 0,
	`playtime_ms` bigint unsigned NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`),
	CONSTRAINT `characters_user_slot_unique` UNIQUE(`user_id`,`slot`)
);
--> statement-breakpoint
CREATE TABLE `item_instances` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` bigint unsigned NOT NULL,
	`item_id` varchar(64) NOT NULL,
	`refine` int NOT NULL DEFAULT 0,
	`cards` json,
	`location` enum('inventory','equipment','storage','mail','world') NOT NULL DEFAULT 'inventory',
	`equipped_slot` varchar(32),
	`count` int NOT NULL DEFAULT 1,
	`acquired_from` varchar(64),
	`acquired_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `item_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pvp_matches` (
	`id` varchar(36) NOT NULL,
	`user_a_id` bigint unsigned NOT NULL,
	`user_b_id` bigint unsigned NOT NULL,
	`winner_user_id` bigint unsigned,
	`score_a` int NOT NULL DEFAULT 0,
	`score_b` int NOT NULL DEFAULT 0,
	`seed` bigint unsigned NOT NULL,
	`replay` longtext,
	`elo_delta` int,
	`started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`ended_at` timestamp,
	CONSTRAINT `pvp_matches_id` PRIMARY KEY(`id`)
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
CREATE TABLE `user_achievements` (
	`user_id` bigint unsigned NOT NULL,
	`achievement_id` varchar(64) NOT NULL,
	`unlocked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`meta` json,
	CONSTRAINT `user_achievements_user_ach_pk` UNIQUE(`user_id`,`achievement_id`)
);
--> statement-breakpoint
CREATE TABLE `user_elo` (
	`user_id` bigint unsigned NOT NULL,
	`elo` int NOT NULL DEFAULT 1000,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`draws` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_elo_user_pk` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` bigint unsigned NOT NULL,
	`display_name` varchar(32),
	`avatar_key` varchar(64),
	`country` varchar(2),
	`bio` varchar(280),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_user_pk` UNIQUE(`user_id`)
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
CREATE TABLE `zeny_transactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`from_user_id` bigint unsigned,
	`to_user_id` bigint unsigned,
	`amount` bigint NOT NULL,
	`reason` varchar(64) NOT NULL,
	`meta` json,
	`ts` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `zeny_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `auth_log_user_ix` ON `auth_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_log_ts_ix` ON `auth_log` (`ts`);--> statement-breakpoint
CREATE INDEX `character_map_states_char_ix` ON `character_map_states` (`character_id`);--> statement-breakpoint
CREATE INDEX `characters_base_level_ix` ON `characters` (`base_level`);--> statement-breakpoint
CREATE INDEX `characters_zeny_ix` ON `characters` (`zeny`);--> statement-breakpoint
CREATE INDEX `item_instances_owner_ix` ON `item_instances` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `item_instances_item_id_ix` ON `item_instances` (`item_id`);--> statement-breakpoint
CREATE INDEX `pvp_matches_user_a_ix` ON `pvp_matches` (`user_a_id`);--> statement-breakpoint
CREATE INDEX `pvp_matches_user_b_ix` ON `pvp_matches` (`user_b_id`);--> statement-breakpoint
CREATE INDEX `pvp_matches_started_ix` ON `pvp_matches` (`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_ix` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_ix` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_achievements_user_ix` ON `user_achievements` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_elo_elo_ix` ON `user_elo` (`elo`);--> statement-breakpoint
CREATE INDEX `zeny_transactions_from_ix` ON `zeny_transactions` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `zeny_transactions_to_ix` ON `zeny_transactions` (`to_user_id`);--> statement-breakpoint
CREATE INDEX `zeny_transactions_ts_ix` ON `zeny_transactions` (`ts`);