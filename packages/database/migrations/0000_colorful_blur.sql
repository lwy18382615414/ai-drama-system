CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`agent_type` text NOT NULL,
	`skill_name` text NOT NULL,
	`skill_version` text NOT NULL,
	`model` text,
	`input_json` text NOT NULL,
	`output_json` text,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`generation_task_id` text,
	`url` text NOT NULL,
	`provider` text,
	`model` text,
	`prompt` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_task_id`) REFERENCES `generation_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`alias_json` text DEFAULT '[]' NOT NULL,
	`role` text,
	`age` text,
	`gender` text,
	`appearance` text,
	`personality` text,
	`background` text,
	`relationship_json` text DEFAULT '[]' NOT NULL,
	`reference_image_url` text,
	`voice_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_project_name_unique` ON `characters` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `episode_character_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`character_id` text NOT NULL,
	`usage_type` text DEFAULT 'mentioned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_character_links_episode_character_unique` ON `episode_character_links` (`episode_id`,`character_id`);--> statement-breakpoint
CREATE TABLE `episode_event_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`novel_event_id` text NOT NULL,
	`order_in_episode` integer NOT NULL,
	`usage_type` text DEFAULT 'primary' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`novel_event_id`) REFERENCES `novel_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_event_links_episode_order_unique` ON `episode_event_links` (`episode_id`,`order_in_episode`);--> statement-breakpoint
CREATE UNIQUE INDEX `episode_event_links_novel_event_unique` ON `episode_event_links` (`novel_event_id`);--> statement-breakpoint
CREATE TABLE `episode_prop_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`prop_id` text NOT NULL,
	`usage_type` text DEFAULT 'used' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prop_id`) REFERENCES `props`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_prop_links_episode_prop_unique` ON `episode_prop_links` (`episode_id`,`prop_id`);--> statement-breakpoint
CREATE TABLE `episode_scene_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`usage_type` text DEFAULT 'used' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_scene_links_episode_scene_unique` ON `episode_scene_links` (`episode_id`,`scene_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_no` integer NOT NULL,
	`title` text,
	`summary` text,
	`opening_hook` text,
	`ending_hook` text,
	`script_id` text,
	`video_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_project_episode_no_unique` ON `episodes` (`project_id`,`episode_no`);--> statement-breakpoint
CREATE TABLE `generation_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`storyboard_id` text,
	`target_type` text,
	`target_id` text,
	`task_type` text NOT NULL,
	`provider` text,
	`model` text,
	`input_json` text NOT NULL,
	`output_json` text,
	`status` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `novel_chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_no` integer NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`source` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `novel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`event_no` integer NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`characters_json` text DEFAULT '[]' NOT NULL,
	`location` text,
	`time_hint` text,
	`emotion_tone` text,
	`conflict_level` text DEFAULT 'none' NOT NULL,
	`importance` text DEFAULT 'minor' NOT NULL,
	`source_text_range_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chapter_id`) REFERENCES `novel_chapters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `novel_events_chapter_event_no_unique` ON `novel_events` (`chapter_id`,`event_no`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`genre` text DEFAULT 'drama' NOT NULL,
	`target_platform` text DEFAULT 'short_video' NOT NULL,
	`visual_style` text DEFAULT 'realistic' NOT NULL,
	`episode_duration` integer DEFAULT 60 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `props` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`significance` text,
	`visual_prompt` text,
	`reference_image_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `props_project_name_unique` ON `props` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`location_type` text,
	`visual_style` text,
	`visual_prompt` text,
	`reference_image_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_project_name_unique` ON `scenes` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`opening_hook` text,
	`ending_hook` text,
	`content` text NOT NULL,
	`structured_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scripts_episode_id_unique` ON `scripts` (`episode_id`);--> statement-breakpoint
CREATE TABLE `storyboards` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`shot_no` integer NOT NULL,
	`duration` integer NOT NULL,
	`scene_id` text,
	`character_ids_json` text DEFAULT '[]' NOT NULL,
	`prop_ids_json` text DEFAULT '[]' NOT NULL,
	`script_section_no` integer,
	`shot_type` text NOT NULL,
	`camera_angle` text,
	`camera_movement` text,
	`action` text NOT NULL,
	`dialogue_json` text DEFAULT '[]' NOT NULL,
	`narration` text,
	`emotion` text,
	`image_prompt` text NOT NULL,
	`video_prompt` text NOT NULL,
	`first_frame_image_url` text,
	`last_frame_image_url` text,
	`video_url` text,
	`tts_audio_url` text,
	`subtitle_url` text,
	`composed_video_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storyboards_episode_shot_no_unique` ON `storyboards` (`episode_id`,`shot_no`);