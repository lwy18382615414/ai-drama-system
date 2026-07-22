CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`pending_count` integer DEFAULT 0 NOT NULL,
	`running_count` integer DEFAULT 0 NOT NULL,
	`succeeded_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`estimated_cost` text,
	`cancel_requested_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `generation_jobs_project_created_idx` ON `generation_jobs` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `job_id` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `upstream_revision` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `locked_by` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `locked_at` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `heartbeat_at` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `next_retry_at` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `timeout_seconds` integer;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `error_code` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `error_details_json` text;--> statement-breakpoint
ALTER TABLE `generation_tasks` ADD `repair_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `generation_tasks_claim_idx` ON `generation_tasks` (`status`,`next_retry_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_tasks_lease_idx` ON `generation_tasks` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `generation_tasks_idempotency_idx` ON `generation_tasks` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `generation_tasks_job_idx` ON `generation_tasks` (`job_id`);