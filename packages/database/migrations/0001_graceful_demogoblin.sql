CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`batch_no` integer NOT NULL,
	`chapter_start_no` integer NOT NULL,
	`chapter_end_no` integer NOT NULL,
	`episode_start_no` integer NOT NULL,
	`episode_end_no` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_project_batch_no_unique` ON `batches` (`project_id`,`batch_no`);--> statement-breakpoint
ALTER TABLE `episodes` ADD `batch_id` text REFERENCES batches(id);--> statement-breakpoint
CREATE INDEX `episodes_batch_id_idx` ON `episodes` (`batch_id`);--> statement-breakpoint
-- Idempotent backfill: any project that already has episodes but no batch gets a
-- synthesized batch 1 covering its full chapter + episode range. No-op on a fresh DB
-- (episodes = 0). Re-runnable: the INSERT is skipped once every episode has a batch_id.
INSERT INTO `batches` (
	`id`, `project_id`, `batch_no`,
	`chapter_start_no`, `chapter_end_no`,
	`episode_start_no`, `episode_end_no`,
	`status`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	e.`project_id`,
	1,
	COALESCE((SELECT min(c.`chapter_no`) FROM `novel_chapters` c WHERE c.`project_id` = e.`project_id`), 1),
	COALESCE((SELECT max(c.`chapter_no`) FROM `novel_chapters` c WHERE c.`project_id` = e.`project_id`), 1),
	min(e.`episode_no`),
	max(e.`episode_no`),
	'planned',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `episodes` e
WHERE e.`batch_id` IS NULL
GROUP BY e.`project_id`;--> statement-breakpoint
UPDATE `episodes`
SET `batch_id` = (
	SELECT b.`id` FROM `batches` b
	WHERE b.`project_id` = `episodes`.`project_id` AND b.`batch_no` = 1
)
WHERE `batch_id` IS NULL;