# API Design

## Overview

This document records the completed Phase 1 API surface, the Phase 2A image task infrastructure, and the active Phase 2B character reference image loop.

Phase 1 is complete:

novel_chapters → novel_events → episodes + episode_event_links → scripts → characters/scenes/props → storyboards

Phase 2A provides `ImageProvider`, mock image generation tasks, and image asset records. Phase 2B activates only the character reference image loop. Later Phase 2 APIs for real image providers, scene image generation, storyboard first-frame generation, video generation, TTS, subtitle, FFmpeg composition, and final video export remain paused.

## Route Mounting

The Hono app mounts the Phase 1 route groups in `apps/server/app.ts`:

- EventAgent routes under `/api/agents/event`
- Episode planning routes at the root app path with full `/api/...` route definitions
- Script routes at the root app path with full `/api/...` route definitions
- Asset extraction routes at the root app path with full `/api/...` route definitions
- Storyboard routes at the root app path with full `/api/...` route definitions
- Image generation routes at the root app path with full `/api/...` route definitions

## Health

### `GET /health`

Returns basic service health.

## Event Extraction Routes

Implemented by `apps/server/routes/event-agent.ts`.

### `POST /api/agents/event/extract`

Starts EventAgent extraction for a chapter.

Purpose:

- `novel_chapters → novel_events`
- creates a task record
- logs the Agent run
- returns `202 Accepted`

### `GET /api/agents/event/status/:taskId`

Fetches task status for event extraction.

### `GET /api/agents/event/result/:chapterId`

Fetches extracted events for a chapter.

Returns:

- `events[]`

## Episode Planning Routes

Implemented by `apps/server/routes/episode-planner.ts`.

### `POST /api/projects/:projectId/plan-episodes`

Starts EpisodePlannerAgent planning for a project.

Purpose:

- `novel_events → episodes + episode_event_links`
- creates episode records
- creates ordered source event links
- creates a task record
- logs the Agent run
- returns `202 Accepted`

### `GET /api/projects/:projectId/episodes`

Lists planned episodes for a project.

Returns:

- `episodes[]`

### `GET /api/episodes/:episodeId/events`

Fetches one episode and its linked source events.

## Script Routes

Implemented by `apps/server/routes/script.ts`.

### `POST /api/episodes/:episodeId/generate-script`

Starts ScriptAgent generation for an episode.

Purpose:

- `episodes + linked novel_events → scripts`
- creates or updates the episode script
- creates a task record
- logs the Agent run
- returns `202 Accepted`

Notes:

- Supports `force` through request body or query string where implemented by the service route.

### `GET /api/episodes/:episodeId/script`

Fetches one episode script.

### `PATCH /api/scripts/:scriptId`

Updates an existing script.

Purpose:

- supports editable script workflow after generation

## Asset Extraction Routes

Implemented by `apps/server/routes/assets.ts`.

### `POST /api/episodes/:episodeId/extract-assets`

Starts ExtractAgent asset extraction for an episode script.

Purpose:

- `scripts → characters + scenes + props`
- creates or reuses project assets
- creates episode asset links
- creates a task record
- logs the Agent run
- returns `202 Accepted`

Notes:

- Supports `force` through request body or query string where implemented by the service route.

### `GET /api/episodes/:episodeId/assets`

Fetches assets linked to an episode.

Returns:

- episode context
- linked characters
- linked scenes
- linked props

### `GET /api/projects/:projectId/characters`

Lists project characters.

### `GET /api/characters/:characterId`

Fetches one character, including `referenceImageUrl` and `reference_image_url` for the current character reference image URL.

### `GET /api/projects/:projectId/scenes`

Lists project scenes.

### `GET /api/projects/:projectId/props`

Lists project props.

## Storyboard Routes

Implemented by `apps/server/routes/storyboard.ts`.

### `POST /api/episodes/:episodeId/generate-storyboards`

Starts StoryboardAgent generation for an episode.

Purpose:

- `scripts + characters + scenes + props → storyboards`
- creates storyboard shots
- creates a task record
- logs the Agent run
- returns `202 Accepted`

Notes:

- Supports `force` through request body or query string where implemented by the service route.
- Generated `image_prompt` and `video_prompt` values are persisted storyboard planning fields only while Phase 2 is paused.

### `GET /api/episodes/:episodeId/storyboards`

Lists storyboard shots for an episode.

### `GET /api/storyboards/:storyboardId`

Fetches one storyboard shot.

### `PATCH /api/storyboards/:storyboardId`

Updates one storyboard shot.

Purpose:

- supports editable storyboard workflow after generation

## Phase 2A Image Generation Routes

Implemented by `apps/server/routes/image-generation.ts`.

### `POST /api/projects/:projectId/generate-image`

Starts a mock image generation task for one supported target.

Supported `target_type` values:

- `character_reference_image`
- `scene_reference_image`
- `storyboard_first_frame`

Purpose:

- creates a `generation_tasks` row with `task_type = image_generation`
- calls `MockImageProvider`
- writes an `assets` row
- updates the target URL field
- returns `202 Accepted`

## Phase 2B Character Reference Image Routes

Implemented by `apps/server/routes/image-generation.ts` and `apps/server/services/image-generation-service.ts`.

### `POST /api/characters/:characterId/generate-image`

Starts a mock character reference image generation task for one character.

Purpose:

- reads `characters.name`, `role`, `appearance`, `personality`, and project `visual_style`
- creates a `generation_tasks` row with `task_type = image_generation`
- calls `MockImageProvider`
- writes an `assets` row with `asset_type = character_reference_image`
- updates `characters.reference_image_url` when the task completes
- returns `202 Accepted` with `{ taskId, status }`

Notes:

- Supports `force` through request body or query string.
- If `force` is false and the character already has `reference_image_url`, the service does not start duplicate generation.
- This endpoint does not activate scene image, storyboard first-frame, video, TTS, subtitle, FFmpeg, or final export workflows.

Notes:

- Supports `force` through request body or query string.
- Does not call real image models.

### `GET /api/generation-tasks/:taskId`

Fetches a generation task by ID for polling.

### `GET /api/projects/:projectId/assets`

Lists generated asset records for a project.

## Later Phase 2 API Boundary

Do not add routes for the following unless the user explicitly requests expanding Phase 2 beyond Phase 2B:

- real image provider integration
- video generation
- TTS generation
- subtitle generation
- FFmpeg composition
- final episode video export
- bulk media job orchestration
