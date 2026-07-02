# API Design

## Overview

This document records the completed Phase 1 API surface, the Phase 2A image task infrastructure, and the completed Phase 2B–2C mock image generation loops (character reference images, scene reference images, storyboard first frames, and episode-level batch generation).

Phase 1 is complete:

novel_chapters → novel_events → episodes + episode_event_links → scripts → characters/scenes/props → storyboards

Phase 2A provides `ImageProvider`, mock image generation tasks, and image asset records. Phase 2B–2C activate character, scene, and storyboard first-frame mock image generation, including episode-level batch routes. Later Phase 2 APIs for real image providers, video generation, TTS, subtitle, FFmpeg composition, and final video export remain paused.

## Route Mounting

The Hono app mounts the route groups in `apps/server/app.ts`:

- Project routes at the root app path with full `/api/...` route definitions
- EventAgent routes under `/api/agents/event`
- Episode planning routes at the root app path with full `/api/...` route definitions
- Script routes at the root app path with full `/api/...` route definitions
- Asset extraction routes at the root app path with full `/api/...` route definitions
- Storyboard routes at the root app path with full `/api/...` route definitions
- Image generation routes at the root app path with full `/api/...` route definitions

## Health

### `GET /health`

Returns basic service health.

## Project Routes

Implemented by `apps/server/routes/project.ts`.

### `GET /api/projects`

Lists projects.

### `POST /api/projects`

Creates a project. Returns `201 Created`.

### `GET /api/projects/:projectId`

Fetches one project detail.

### `GET /api/projects/:projectId/chapters`

Lists source chapters for a project.

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

### `GET /api/scenes/:sceneId`

Fetches one scene, including its current `reference_image_url`.

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

## Phase 2A–2C Image Generation Routes

Implemented by `apps/server/routes/image-generation.ts` and `apps/server/services/image-generation-service.ts`.

All image routes share these behaviors:

- create a `generation_tasks` row with `task_type = image_generation`
- call `MockImageProvider` only
- write `assets` rows
- update the corresponding target URL field
- support `force` through request body or query string; when `force` is false and the target already has an image URL, generation is skipped
- do not call real image models

### Single-target routes

#### `POST /api/characters/:characterId/generate-image`

Starts a mock character reference image task for one character. Builds the prompt from `characters.name`, `role`, `appearance`, `personality`, and project `visual_style`. Writes `asset_type = character_reference_image` and updates `characters.reference_image_url`. Returns `202 Accepted` with `{ taskId, status }`.

#### `POST /api/scenes/:sceneId/generate-image`

Starts a mock scene reference image task for one scene. Builds the prompt from `scenes.visual_prompt`, `name`, `description`, `location_type`, scene `visual_style`, and project `visual_style`. Writes `asset_type = scene_reference_image` and updates `scenes.reference_image_url`. Returns `202 Accepted`.

#### `POST /api/storyboards/:storyboardId/generate-first-frame`

Starts a mock storyboard first-frame task for one shot. Composes the prompt from `storyboards.image_prompt` plus linked scene and character context (including existing reference image URLs). Writes `asset_type = storyboard_first_frame` and updates `storyboards.first_frame_image_url`. Returns `202 Accepted`.

#### `POST /api/projects/:projectId/generate-image`

Starts a mock image generation task for one explicitly specified target. Accepts a body with `target_type` and `target_id`.

Supported `target_type` values:

- `character_reference_image`
- `scene_reference_image`
- `storyboard_first_frame`

Returns `202 Accepted`.

### Episode-level batch routes

Each batch route resolves all episode-linked targets, skips targets that already have an image unless `force=true`, generates images through the mock provider, and returns `200 OK` with a per-target summary.

- `POST /api/episodes/:episodeId/generate-character-images`
- `POST /api/episodes/:episodeId/generate-scene-images`
- `POST /api/episodes/:episodeId/generate-storyboard-first-frames`
- `POST /api/episodes/:episodeId/generate-all-images` — runs all three target types for the episode

### Status and asset query routes

#### `GET /api/episodes/:episodeId/image-generation-status`

Returns episode-level image progress counts per target type. `404` if the episode is not found.

#### `GET /api/generation-tasks/:taskId`

Fetches a generation task by ID for polling.

#### `GET /api/projects/:projectId/assets`

Lists generated asset records for a project.

## Later Phase 2 API Boundary

Do not add routes for the following unless the user explicitly requests expanding Phase 2 beyond Phase 2C:

- real image provider integration
- video generation
- TTS generation
- subtitle generation
- FFmpeg composition
- final episode video export
- bulk media job orchestration
