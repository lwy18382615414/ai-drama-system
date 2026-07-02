# Database Design

## Current Status

Phase 1 is complete. The database supports the completed backend narrative pipeline through storyboard generation.

Phase 2A provides image-provider task infrastructure. Phase 2B–2C activate mock character reference images, scene reference images, storyboard first frames, and episode-level batch generation on top of that infrastructure. The database records mock image generation tasks, generated image assets, and active image URLs for characters (`reference_image_url`), scenes (`reference_image_url`), and storyboards (`first_frame_image_url`). Later Phase 2 media workflows remain paused.

## Phase 1 Data Flow

projects
↓
novel_chapters
↓
novel_events
↓
episodes + episode_event_links
↓
scripts
↓
characters / scenes / props
↓
episode_character_links / episode_scene_links / episode_prop_links
↓
storyboards

Operational logging and task tracking:

- `generation_tasks` tracks long-running generation task status.
- `agent_runs` logs Agent inputs, outputs, status, and errors.
- `assets` records generated media asset provenance and active image URLs for characters, scenes, and storyboard first frames in Phase 2B–2C.

## Core Phase 1 Tables

- projects
- novel_chapters
- novel_events
- episodes
- episode_event_links
- scripts
- characters
- scenes
- props
- episode_character_links
- episode_scene_links
- episode_prop_links
- storyboards
- generation_tasks
- agent_runs
- assets

## Important Tables

### projects

Project-level configuration and style settings.

Fields:

- id
- title
- description
- genre
- target_platform
- visual_style
- episode_duration
- status
- created_at
- updated_at

### novel_chapters

Imported or seeded source novel chapters.

Fields:

- id
- project_id
- chapter_no
- title
- content
- word_count
- source
- status
- created_at
- updated_at

### novel_events

Structured events extracted by EventAgent from `novel_chapters`.

Fields:

- id
- project_id
- chapter_id
- event_no
- event_type
- summary
- detail
- characters_json
- location
- time_hint
- emotion_tone
- conflict_level
- importance
- source_text_range_json
- created_at
- updated_at

Important constraint:

- unique `(chapter_id, event_no)`

### episodes

Planned short-drama episodes created by EpisodePlannerAgent.

Fields:

- id
- project_id
- episode_no
- title
- summary
- opening_hook
- ending_hook
- script_id
- video_url
- status
- created_at
- updated_at

Important constraint:

- unique `(project_id, episode_no)`

Phase 2 note:

- `video_url` is reserved for future media-generation/composition output and is not active while Phase 2 is paused.

### episode_event_links

Ordered links from planned episodes back to source `novel_events`.

Fields:

- id
- project_id
- episode_id
- novel_event_id
- order_in_episode
- usage_type
- created_at
- updated_at

Important constraints:

- unique `(episode_id, order_in_episode)`
- unique `(novel_event_id)`

### scripts

Adapted episode scripts created by ScriptAgent.

Fields:

- id
- project_id
- episode_id
- title
- summary
- opening_hook
- ending_hook
- content
- structured_json
- status
- created_at
- updated_at

Important constraint:

- unique `(episode_id)`

### characters

Project-level character assets extracted by ExtractAgent.

Fields:

- id
- project_id
- name
- alias_json
- role
- age
- gender
- appearance
- personality
- background
- relationship_json
- reference_image_url
- voice_id
- status
- created_at
- updated_at

Important constraint:

- unique `(project_id, name)`

Phase 2B note:

- `reference_image_url` is active for the character reference image generation loop and is updated after the mock image task completes.
- `voice_id` remains reserved for future audio workflows.

### scenes

Project-level scene/location assets extracted by ExtractAgent.

Fields:

- id
- project_id
- name
- description
- location_type
- visual_style
- visual_prompt
- reference_image_url
- status
- created_at
- updated_at

Important constraint:

- unique `(project_id, name)`

Phase 2C note:

- `visual_prompt` is a planning/reference field used as an input to the scene reference image prompt.
- `reference_image_url` is active for the scene reference image generation loop and is updated after the mock image task completes.

### props

Project-level prop assets extracted by ExtractAgent.

Fields:

- id
- project_id
- name
- description
- significance
- visual_prompt
- reference_image_url
- status
- created_at
- updated_at

Important constraint:

- unique `(project_id, name)`

Phase 2 note:

- `visual_prompt` and `reference_image_url` are planning/reference fields; they should not trigger image-generation provider calls while Phase 2 is paused.

### episode_character_links

Episode-to-character usage links created by ExtractAgent.

Fields:

- id
- project_id
- episode_id
- character_id
- usage_type
- created_at
- updated_at

Important constraint:

- unique `(episode_id, character_id)`

### episode_scene_links

Episode-to-scene usage links created by ExtractAgent.

Fields:

- id
- project_id
- episode_id
- scene_id
- usage_type
- created_at
- updated_at

Important constraint:

- unique `(episode_id, scene_id)`

### episode_prop_links

Episode-to-prop usage links created by ExtractAgent.

Fields:

- id
- project_id
- episode_id
- prop_id
- usage_type
- created_at
- updated_at

Important constraint:

- unique `(episode_id, prop_id)`

### storyboards

Shot-level storyboard records created by StoryboardAgent.

Fields:

- id
- project_id
- episode_id
- shot_no
- duration
- scene_id
- character_ids_json
- prop_ids_json
- script_section_no
- shot_type
- camera_angle
- camera_movement
- action
- dialogue_json
- narration
- emotion
- image_prompt
- video_prompt
- first_frame_image_url
- last_frame_image_url
- video_url
- tts_audio_url
- subtitle_url
- composed_video_url
- status
- created_at
- updated_at

Important constraint:

- unique `(episode_id, shot_no)`

Phase 2 note:

- `image_prompt` and `video_prompt` are Phase 1 storyboard planning fields. `image_prompt` is used as an input to the Phase 2C storyboard first-frame image prompt.
- `first_frame_image_url` is active for the Phase 2C storyboard first-frame generation loop and is updated after the mock image task completes.
- `last_frame_image_url`, `video_url`, `tts_audio_url`, `subtitle_url`, and `composed_video_url` are reserved for paused later Phase 2 media workflows.

### generation_tasks

Long-running task records for Agent and future generation workflows.

Fields:

- id
- project_id
- episode_id
- storyboard_id
- target_type
- target_id
- task_type
- provider
- model
- input_json
- output_json
- status
- retry_count
- error_message
- started_at
- completed_at
- created_at
- updated_at

### assets

Generated asset records for Phase 2A and future media workflows.

Fields:

- id
- project_id
- asset_type
- target_type
- target_id
- generation_task_id
- url
- provider
- model
- prompt
- metadata_json
- status
- created_at
- updated_at

Phase 2A–2C supported `asset_type` / `target_type` values:

- `character_reference_image`
- `scene_reference_image`
- `storyboard_first_frame`

### agent_runs

Audit log for Agent execution.

Fields:

- id
- project_id
- episode_id
- agent_type
- skill_name
- skill_version
- model
- input_json
- output_json
- status
- error_message
- created_at
- updated_at
