# System Architecture

## Goal

Build an AI short-drama generation platform.

Input:

- novel chapter
- story outline
- user idea

Current Phase 1 output:

- chapter events
- episode plans
- adapted scripts
- characters
- scenes
- props
- storyboards

Active image output, Phase 2A–2C:

- character reference images
- scene reference images
- storyboard first-frame images

Future media output, currently paused in later Phase 2:

- refined visual prompts
- video prompts and generated videos
- TTS audio
- subtitles
- final episode video

## Current Completed Scope: Phase 1

Phase 1 is complete. It implements the backend narrative-production chain from imported novel chapters to editable storyboard records.

### Phase 1 Main Chain

novel_chapters
↓
novel_events
↓
batches → episodes + episode_event_links
↓
scripts
↓
characters + scenes + props
↓
storyboards

### Phase 1A EventAgent

`novel_chapters → novel_events`

Extracts structured story events from source chapter text.

### Phase 1B EpisodePlannerAgent (batched)

`novel_events → batches → episodes + episode_event_links`

Groups source events into short-drama episodes and records the ordered event links used by
each episode. Planning is **batched and re-runnable**: a batch is one contiguous chapter
range planned into one contiguous episode range. Two operations exist — plan the next batch
(`startBatchPlanning`, chapter start auto-locked to the previous batch's end + 1) and re-plan
an existing batch (`startBatchReplan`, scoped destructive: rebuilds only that batch's episodes
and renumbers following batches to keep `episode_no` globally continuous). Planning a batch is
rejected (422) if any chapter in the selected range has not had its events extracted. See
`docs/database-design.md` (batches / episodes) and `docs/api-design.md` (batch routes).

### Phase 1C ScriptAgent

`episodes + linked novel_events → scripts`

Rewrites each planned episode and its linked events into an adapted short-drama script.

### Phase 1D ExtractAgent

`scripts → characters + scenes + props`

Extracts reusable production assets from scripts and links them back to the episode.

### Phase 1E StoryboardAgent

`scripts + characters + scenes + props → storyboards`

Creates shot-level storyboards from the script and extracted assets.

## Completed Scope: Phase 2A–2C Image Generation

Phase 2A provides ImageProvider + image task infrastructure. Phase 2B adds the character reference image loop. Phase 2C adds scene reference images, storyboard first frames, and episode-level batch generation.

The image generation flow is:

target (character / scene / storyboard shot)
↓
image generation request (single target or episode batch)
↓
`generation_tasks` image task
↓
configured `ImageProvider`
↓
`assets` record
↓
target URL field update

Active generated targets and updated URL fields:

- `character_reference_image` → `characters.reference_image_url`
- `scene_reference_image` → `scenes.reference_image_url`
- `storyboard_first_frame` → `storyboards.first_frame_image_url`

Episode-level batch routes generate images for all episode-linked characters, scenes, or storyboard shots, skipping targets that already have an image unless `force=true`. Runtime image generation uses `OpenAICompatibleImageProvider`; `MockImageProvider` is retained only for tests.

## Text Provider Selection

The server composition root constructs the structured text provider from required environment variables:

- `TEXT_PROVIDER_API_KEY`
- `TEXT_PROVIDER_BASE_URL`
- `TEXT_PROVIDER_MODEL` optional model override

## Frontend Workbench

`apps/web` implements the Vue 3 / Vite / Naive UI workbench with pages for project list/overview, novel import, episode planning, script editing, asset management, character images, and storyboards. It talks to the API server through an axios client. For async task status it subscribes to the per-project SSE stream (`GET /api/projects/:projectId/tasks/stream`) as the primary channel, with per-task polling (`GET /api/generation-tasks/:taskId` and the agent-specific status routes) retained as a fallback.

## Real-Time Task Streaming

Task lifecycle updates are pushed to clients over Server-Sent Events instead of relying solely on polling. The in-process `TaskWorker` (`packages/tasks/task-worker.ts`) implements a `TaskEventBus`, emitting a `TaskEvent` when a task is claimed (`running`) and when a run settles (`completed`/`failed`/requeued). The SSE route (`apps/server/routes/task-stream.ts`) subscribes to that bus per project.

Reconnection recovery uses a snapshot-on-connect model: on every (re)connect the server first sends a `snapshot` event — all active tasks plus recently settled ones from `listRecoverableTasks` — so a client rebuilt from a page refresh reconciles to the database truth without persisting any `taskId`. The event bus is process-local, matching the current single-process MVP; a multi-process deployment would replace it with Redis Pub/Sub (or Postgres `LISTEN/NOTIFY`), the same evolution line as `TaskScheduler`→BullMQ. See `docs/task-stream.md`.

## Paused Scope: Later Phase 2

Later Phase 2 is paused. Do not implement video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2C. Real image-provider integration is already active in Phase 2A–2C.

Paused/future media pipeline:

storyboards
↓
image prompt refinement
↓
image generation
↓
video prompt refinement
↓
video generation
↓
TTS / subtitle generation
↓
single-shot composition
↓
episode merge / final video export

Storyboard rows contain `image_prompt` and `video_prompt` planning fields. `image_prompt` is actively used by the Phase 2C first-frame image loop; `video_prompt` remains a planning field and must not trigger a video-provider call.

## Next Architecture Baseline: Reliability and Version Governance

`docs/backend-refactor-plan.md` is the approved target baseline for the next backend phase. It does not change the current single-instance deployment immediately. The implementation order is: SQLite stability and backup; task lease/timeout/retry/idempotency; revision and stale propagation; batch Job orchestration; then only where deployment needs justify it, PostgreSQL, cross-process queue/events, and object storage.

The target task boundary remains `Route → Service → Scheduler → Worker/Handler → Provider → Database/Storage`. Task business writes and successful terminal status must become atomic; workers own leases, timeout recovery and retry policy. Pipeline stage display is derived from valid revisions and tasks rather than duplicated Episode state. Video/media capability remains a later, explicitly gated extension.

## Core Layers

1. Frontend workbench
2. API service
3. Agent orchestration
4. Memory system
5. Skill loader
6. Provider adapter
7. Task system
8. Database
9. Object storage
10. FFmpeg composition

Phase 1 currently exercises:

- API service
- Agent orchestration
- structured text provider adapter
- task status persistence
- real-time task streaming (SSE) with snapshot-on-connect reconnection recovery
- database persistence
- agent run logging

Phase 2A–2C currently exercise the image provider adapter, task status persistence, database persistence, asset provenance records, and character/scene/storyboard image URL updates through `OpenAICompatibleImageProvider`, including episode-level batch generation. The frontend workbench and axios API client are also active. Object storage, video/audio provider adapters, FFmpeg composition, and final video export remain later Phase 2+ concerns and are currently paused.

## MVP Scope

The MVP should prioritize:

1. novel import
2. event extraction
3. episode planning
4. script generation
5. asset extraction
6. storyboard generation
7. editable storyboard workbench

Do not start with complex canvas, timeline, full video editor, or media-generation pipeline work unless explicitly requested.
