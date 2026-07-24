DROP INDEX `generation_tasks_idempotency_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `generation_tasks_idempotency_idx` ON `generation_tasks` (`idempotency_key`);--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `metadata_json` text DEFAULT '{}' NOT NULL;