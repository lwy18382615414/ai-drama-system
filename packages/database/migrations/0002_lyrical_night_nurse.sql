CREATE TABLE `character_appearance_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`source_episode_id` text,
	`effective_from_episode_no` integer,
	`appearance` text NOT NULL,
	`reference_image_url` text,
	`change_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cav_character_source_episode_unique` ON `character_appearance_versions` (`character_id`,`source_episode_id`) WHERE source_episode_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cav_character_effective_from_unique` ON `character_appearance_versions` (`character_id`,`effective_from_episode_no`) WHERE effective_from_episode_no IS NOT NULL;--> statement-breakpoint
CREATE INDEX `cav_character_id_idx` ON `character_appearance_versions` (`character_id`);