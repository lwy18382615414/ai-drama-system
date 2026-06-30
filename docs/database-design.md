# Database Design

## Core Tables

- projects
- episodes
- novel_chapters
- novel_events
- scripts
- characters
- scenes
- props
- storyboards
- assets
- generation_tasks
- ai_provider_configs
- ai_voices
- skills
- agent_runs
- memories

## Important Tables

### projects

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

### episodes

Fields:

- id
- project_id
- episode_no
- title
- summary
- script_id
- video_url
- status
- created_at
- updated_at

### characters

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

### storyboards

Fields:

- id
- project_id
- episode_id
- shot_no
- duration
- scene_id
- character_ids_json
- shot_type
- camera_angle
- camera_movement
- action
- dialogue_json
- narration
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

### generation_tasks

Fields:

- id
- project_id
- episode_id
- storyboard_id
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

### agent_runs

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