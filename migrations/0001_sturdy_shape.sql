ALTER TABLE `characters` ADD `last_seen_at` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `offline_baseline_exp_per_min` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `offline_baseline_job_exp_per_min` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `offline_mode` tinyint DEFAULT 0 NOT NULL;