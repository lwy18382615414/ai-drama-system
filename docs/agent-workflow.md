# Agent Workflow Design

## Current Status

Phase 1 is complete. Phase 2A image-provider task infrastructure is in place, and Phase 2B–2C activate character reference images, scene reference images, storyboard first frames, and episode-level batch image generation; later Phase 2 media-generation work is paused.

The completed Phase 1 chain is:

novel_chapters → novel_events → episodes + episode_event_links → scripts → characters/scenes/props → storyboards

Do not implement video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2C.

## Agent List

Phase 1 completed Agents:

- EventAgent
- EpisodePlannerAgent
- ScriptAgent
- ExtractAgent
- StoryboardAgent

Future or orchestration Agents:

- OrchestratorAgent
- NovelAgent
- CharacterAgent
- PromptAgent
- ImageAgent
- VideoAgent
- VoiceAgent
- ComposeAgent
- ReviewAgent
- MemoryAgent

## Recommended Control Flow

Do not let Agents freely call each other.

Use OrchestratorAgent or service-layer orchestration to coordinate the workflow:

user action
↓
service validates request
↓
create task record
↓
build context
↓
call target agent through provider adapter
↓
validate structured JSON output with Zod
↓
persist result in transaction where needed
↓
log agent run
↓
update task status

## Agent Rules

Each Agent must have:

- clear responsibility
- input schema
- output schema
- context builder
- service implementation
- validation
- persistence
- agent_runs logging

Every Agent output must be structured JSON and must be validated by its Zod output schema before persistence.

## Phase 1 Completed Agent Chain

### Phase 1A: EventAgent

Transformation:

`novel_chapters → novel_events`

Responsibility:

- Read one source chapter.
- Extract ordered beat-level events.
- Preserve event type, summary, detail, characters, location/time hints, emotion tone, conflict level, importance, and optional source text range.
- Persist extracted events as `novel_events`.

Input:

- `projectId`
- `chapterId`
- source row from `novel_chapters`
- optional extraction settings such as `maxEvents`, `granularity`, and `model`

Output:

- `chapterId`
- `chapterSummary`
- `events[]`
- `totalEvents`

Persistence boundary:

- Creates or replaces `novel_events` for the chapter according to service behavior.
- Creates `generation_tasks` task status records for long-running work.
- Creates `agent_runs` logs.

Routes:

- `POST /api/agents/event/extract`
- `GET /api/agents/event/status/:taskId`
- `GET /api/agents/event/result/:chapterId`

### Phase 1B: EpisodePlannerAgent

Transformation:

`novel_events → episodes + episode_event_links`

Responsibility:

- Read ordered source events for one or more chapters.
- Group events into short-drama episodes.
- Define episode title, summary, opening hook, and ending hook.
- Link source events into each episode in playback order.

Input:

- `projectId`
- `chapterIds[]`
- `novelEvents[]`
- project style config
- optional model setting

Output:

- `episodes[]`
- each episode includes `source_event_links[]` with `novel_event_id`, `order_in_episode`, and `usage_type`

Persistence boundary:

- Creates `episodes`.
- Creates `episode_event_links`.
- Creates `generation_tasks` task status records.
- Creates `agent_runs` logs.

Planning is batched (see `docs/api-design.md`): each batch is a contiguous chapter range
planned into a contiguous episode range, tracked in the `batches` table with `episodes.batchId`.

Routes:

- `GET /api/projects/:projectId/batches`
- `POST /api/projects/:projectId/batches` (plan next batch)
- `POST /api/projects/:projectId/batches/:batchId/replan` (scoped destructive re-plan)
- `GET /api/projects/:projectId/episodes`
- `GET /api/episodes/:episodeId/events`

### Phase 1C: ScriptAgent

Transformation:

`episodes + linked novel_events → scripts`

Responsibility:

- Read one planned episode and its linked source events.
- Rewrite the episode into an adapted short-drama script.
- Preserve hooks and produce structured script sections with dialogue, narration, location, characters, and emotional beats.

Input:

- `projectId`
- `episodeId`
- `episode`
- `episodeEventLinks[]`
- `linkedNovelEvents[]`
- style config
- optional `force` and `model` settings

Output:

- `title`
- `summary`
- `duration_seconds`
- `opening_hook`
- `ending_hook`
- `script_sections[]`

Persistence boundary:

- Creates or updates one `scripts` row for the episode.
- Stores structured JSON in `scripts.structured_json`.
- Links the script from the episode where applicable.
- Creates `generation_tasks` task status records.
- Creates `agent_runs` logs.

Routes:

- `POST /api/episodes/:episodeId/generate-script`
- `GET /api/episodes/:episodeId/script`
- `PATCH /api/scripts/:scriptId`

### Phase 1D: ExtractAgent

Transformation:

`scripts → characters + scenes + props`

Responsibility:

- Read the generated script and its structured script sections.
- Extract reusable production assets.
- Reuse existing project assets when appropriate instead of duplicating names.
- Link extracted assets back to the episode.

Input:

- `projectId`
- `episodeId`
- `episode`
- `script`
- `scriptStructuredJson`
- project style
- existing `characters[]`
- existing `scenes[]`
- existing `props[]`
- optional `force` and `model` settings

Output:

- `characters[]`
- `scenes[]`
- `props[]`

Persistence boundary:

- Creates or reuses `characters`, `scenes`, and `props`.
- Creates `episode_character_links`, `episode_scene_links`, and `episode_prop_links`.
- Creates `generation_tasks` task status records.
- Creates `agent_runs` logs.

Routes:

- `POST /api/episodes/:episodeId/extract-assets`
- `GET /api/episodes/:episodeId/assets`
- `GET /api/projects/:projectId/characters`
- `GET /api/projects/:projectId/scenes`
- `GET /api/projects/:projectId/props`

### Phase 1E: StoryboardAgent

Transformation:

`scripts + characters + scenes + props → storyboards`

Responsibility:

- Read one script and the extracted episode assets.
- Break the script into ordered storyboard shots.
- Attach each shot to known scene, character, and prop IDs.
- Preserve shot type, camera angle, camera movement, action, dialogue, narration, emotion, and prompt planning fields.

Input:

- `projectId`
- `episodeId`
- `episode`
- `script`
- `scriptStructuredJson`
- `characters[]`
- `scenes[]`
- `props[]`
- project style
- optional `force` and `model` settings

Output:

- `storyboards[]`
- each storyboard includes `shot_no`, `duration`, `scene_id`, `character_ids`, `prop_ids`, `script_section_no`, `shot_type`, `camera_angle`, `camera_movement`, `action`, `dialogue`, `narration`, `emotion`, `image_prompt`, and `video_prompt`

Persistence boundary:

- Creates or replaces `storyboards` for the episode according to service behavior.
- Creates `generation_tasks` task status records.
- Creates `agent_runs` logs.

Routes:

- `POST /api/episodes/:episodeId/generate-storyboards`
- `GET /api/episodes/:episodeId/storyboards`
- `GET /api/storyboards/:storyboardId`
- `PATCH /api/storyboards/:storyboardId`

Boundary note:

- `image_prompt` and `video_prompt` are persisted as storyboard planning fields.
- Their presence must not trigger image/video provider calls while Phase 2 is paused.

## Phase 2A–2C Image Task Infrastructure

Phase 2A–2C use service-layer orchestration in `ImageGenerationService` rather than a full ImageAgent.

Flow:

user action
↓
`ImageGenerationService` validates target
↓
create `generation_tasks` row with `task_type = image_generation`
↓
call configured `ImageProvider`
↓
write `assets` row
↓
update target URL field
↓
update task status

Supported targets and updated URL fields:

- `character_reference_image` → `characters.reference_image_url`
- `scene_reference_image` → `scenes.reference_image_url`
- `storyboard_first_frame` → `storyboards.first_frame_image_url`

Both single-target routes and episode-level batch routes are implemented. Batch routes resolve all episode-linked targets, skip targets that already have an image unless `force=true`, and return a per-target summary. `GET /api/episodes/:episodeId/image-generation-status` reports per-target-type progress counts.

No structured text Agent output is produced in this step because the image provider returns a URL, not JSON generated by an LLM.

## Later Phase 2 Boundary

The following Agents are future or paused until Phase 2 is explicitly expanded beyond Phase 2C:

- PromptAgent
- ImageAgent
- VideoAgent
- VoiceAgent
- ComposeAgent

Do not add video/audio provider calls, queue jobs, or FFmpeg composition work beyond the Phase 2A–2C image loop.
