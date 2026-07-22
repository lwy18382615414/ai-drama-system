CREATE TABLE `episode_pipeline_states` (
	`episode_id` text PRIMARY KEY NOT NULL,
	`planning_revision` integer DEFAULT 1 NOT NULL,
	`script_revision` integer DEFAULT 0 NOT NULL,
	`asset_revision` integer DEFAULT 0 NOT NULL,
	`storyboard_revision` integer DEFAULT 0 NOT NULL,
	`image_revision` integer DEFAULT 0 NOT NULL,
	`assets_stale` integer DEFAULT false NOT NULL,
	`storyboards_stale` integer DEFAULT false NOT NULL,
	`images_stale` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
