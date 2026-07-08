# API Design

## Overview

This document records the completed Phase 1 API surface, the Phase 2A image task infrastructure, and the completed Phase 2B–2C image generation loops (character reference images, scene reference images, storyboard first frames, and episode-level batch generation).

Phase 1 is complete:

novel_chapters → novel_events → episodes + episode_event_links → scripts → characters/scenes/props → storyboards

Phase 2A provides `ImageProvider`, image generation tasks, and image asset records. Phase 2B–2C activate character, scene, and storyboard first-frame image generation, including episode-level batch routes. Later Phase 2 APIs for video generation, TTS, subtitle, FFmpeg composition, and final video export remain paused.

## Route Mounting

The Hono app mounts the route groups in `apps/server/app.ts`:

- Project routes at the root app path with full `/api/...` route definitions
- EventAgent routes under `/api/agents/event`
- Episode planning routes at the root app path with full `/api/...` route definitions
- Script routes at the root app path with full `/api/...` route definitions
- Asset extraction routes at the root app path with full `/api/...` route definitions
- Storyboard routes at the root app path with full `/api/...` route definitions
- Image generation routes at the root app path with full `/api/...` route definitions
- Task stream (SSE) routes at the root app path with full `/api/...` route definitions

## Response Envelope

All JSON routes return a unified response envelope:

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

Success responses use `code = 0` and keep the previous route-specific payload inside `data`, such as `{ "project": ... }`, `{ "taskId": "...", "status": "pending" }`, or batch image summaries. Success responses keep their standard HTTP status (`200`, `201` created, `202` accepted).

### Failures do not expose an HTTP error status

Business/logic failures **do not** expose an HTTP error status to the client: they return **HTTP 200** and convey the real error solely through the internal `code`. Clients decide as follows:

- `HTTP 200` → read `code`; `code === 0` is success, any other `code` is a business failure.
- `HTTP !== 200` → a genuine infrastructure failure (see below); show a generic fallback.

Only two failure cases keep a real HTTP status, because they are infrastructure-level, not application-level:

- **`500`** — server crash / unhandled exception (`code 50001`). The raw cause is logged server-side only; the client message is a generic fallback and never leaks internal details.
- **`404`** — the **route itself** does not exist (`code 40400`, `RouteNotFound`), distinct from a resource that exists-but-is-missing (`HTTP 200 + 40401`).

> Reserved for the future: once authentication is added, `401`/`403` will also keep their real HTTP status (they are infrastructure/transport concerns, like `404`/`500`). Not implemented yet.

Error responses use the same envelope with `data = null` unless extra details are needed:

```json
{
  "code": 40001,
  "message": "Invalid request body",
  "data": {
    "issues": []
  }
}
```

Current API codes (the numeric prefixes echo the classic HTTP meaning for readability, but the HTTP layer is `200` for every business failure — only `40400` and `50001` ride a real HTTP status):

- `0` success
- `40001` invalid request body or bad request
- `40002` invalid query parameter
- `40400` route not found (real HTTP `404`)
- `40401` resource not found
- `40901` resource conflict
- `41301` payload too large
- `42201` unprocessable entity (semantically invalid request)
- `50001` internal server error (real HTTP `500`)

Elsewhere in this document, references to `400` / `409` / `413` / `422` describe the **business `code` semantics** (`40001` / `40901` / `41301` / `42201`); the transport-level HTTP status for all of them is `200`.

## Health

### `GET /health`

Returns basic service health inside the unified response envelope.

## Project Routes

Implemented by `apps/server/routes/project.ts`.

### `GET /api/projects`

Lists projects.

### `POST /api/projects`

Creates a project. Returns `201 Created`.

### `POST /api/projects/from-novel`

Novel-driven project creation (the standard creation path in the UI). Body:

- `title` (optional; falls back to `novelMeta.title`, then `未命名项目`)
- `source`: `paste` | `txt` | `epub`
- `chapters[]`: `{ title, content }` (1–1000)
- `novelMeta` (optional): `{ title, author }` from the source file

In one transaction it creates a draft project, imports the chapters, and records a pending `project_profile` generation task, then runs ProjectProfileAgent in the background. Returns `201` with `{ project, chapters, taskId, taskStatus }`. The client polls `GET /api/generation-tasks/:taskId`; the completed task's `outputJson` holds the suggested `{ title, description, genre, visualStyle }`, which is applied via `PATCH /api/projects/:projectId` after user confirmation (it is never auto-applied).

### `DELETE /api/projects/:projectId`

Deletes a project and cascades to all dependent rows (chapters, events, episodes and their links, scripts, characters/scenes/props, storyboards, agent runs, generation tasks, assets) in one transaction.

### `GET /api/projects/:projectId`

Fetches one project detail.

### `PATCH /api/projects/:projectId`

Updates project basic information. Supported fields:

- `title`
- `description`
- `genre`
- `targetPlatform`
- `visualStyle`
- `episodeDuration`

Returns the updated project detail.

### `GET /api/projects/:projectId/chapters`

Lists source chapters for a project.

### `POST /api/projects/:projectId/chapters/import`

Appends chapters to an existing project. Body: `{ source: 'paste' | 'txt' | 'epub', chapters: [{ title, content }] }`. Chapter numbers continue after the project's current max. Returns `201 Created`.

### `POST /api/projects/:projectId/chapters/delete`

Batch-deletes chapters. Body: `{ chapterIds: string[] }`. All-or-nothing: the whole request is
rejected when any selected chapter is planned into a batch (`409` — its events are referenced by
`episode_event_links` and deleting it would break the planner's contiguous chapter-range
invariant), currently extracting (`409`), or unknown (`400`). On success, each chapter's
`novel_events` are deleted with it and the surviving unplanned tail is renumbered inside the same
transaction so `chapterNo` stays contiguous for future batch planning. Returns `{ deletedCount }`.

## Novel Preview Routes

Implemented by `apps/server/routes/novel.ts`. Both endpoints are project-agnostic (usable before a project exists) and persist nothing.

### `POST /api/novel/preview`

Splits pasted novel text into chapter candidates using heading detection (`第X章` / `Chapter N` / numbered lists) with a length-based fallback. Body: `{ text }` (max 2,000,000 chars). Returns `{ chapters: [{ title, content, wordCount }], meta: null }`.

### `POST /api/novel/preview-file`

Multipart upload (`file` field) of an `.epub` file (max 30MB, `413` above the limit). Parses the EPUB spine/TOC into chapters server-side; oversized sections (>10,000 chars) and single-HTML books are re-split by heading detection. DRM-protected EPUBs are rejected with `400`. Returns `{ chapters, meta: { title, author } }`.

## Event Extraction Routes

Implemented by `apps/server/routes/event-agent.ts`.

### `POST /api/agents/event/extract`

Starts EventAgent extraction for a chapter.

Purpose:

- `novel_chapters → novel_events`
- creates a task record
- logs the Agent run
- returns `202 Accepted`

### `POST /api/agents/event/extract-batch`

Starts EventAgent extraction for many chapters via server-side fan-out. Body:
`{ projectId, chapterIds: string[], options? }`.

- One independent `event_extraction` task is enqueued per eligible chapter (single transaction),
  so SSE updates, per-chapter status, and per-chapter retry keep single-extract semantics.
- Unknown chapter ids reject the whole request with `400` (stale client list).
- Chapters already planned into a batch are skipped with reason `planned` (their events are
  FK-referenced by `episode_event_links`; re-extraction would violate the FK).
- Chapters currently extracting (status `event_extracting` or an active extraction task) are
  skipped with reason `extracting`.
- Extracted-but-unplanned chapters are re-extracted (delete + reinsert).

Returns `202 Accepted` with `{ tasks: [{ taskId, chapterId }], skipped: [{ chapterId, reason }] }`.

### `GET /api/agents/event/status/:taskId`

Fetches task status for event extraction.

### `GET /api/agents/event/result/:chapterId`

Fetches extracted events for a chapter.

Returns:

- `events[]`

## Episode Planning Routes

Implemented by `apps/server/routes/episode-planner.ts`.

Planning is **batched**: chapters are grouped into contiguous batches, each planned into
a contiguous run of episodes. A batch is a first-class entity (`batches` table); episodes
carry a `batchId`. Global `episodeNo` stays continuous across batches.

### `GET /api/projects/:projectId/batches`

Lists the project's batches (ordered by `batchNo`), each with its chapter/episode ranges
and status (`planned | replanning | failed`).

### `POST /api/projects/:projectId/batches`

Plans the **next batch**. The chapter start is locked to `(last batch's chapterEndNo) + 1`;
the body picks `chapterEndNo`. Rejects with `422` if any chapter in the selected range has
not had its events extracted (`status !== 'event_extracted'`), listing the offending
chapter numbers. Enqueues EpisodePlannerAgent, returns `202 Accepted` with `{ taskId, batchId }`.

Purpose:

- `novel_events (selected chapters) → episodes + episode_event_links`
- appends episodes after the last batch's episodes
- creates a task record, logs the Agent run

### `POST /api/projects/:projectId/batches/:batchId/replan`

**Scoped destructive re-plan** of one batch. Deletes that batch's episode orchestration
(episodes / scripts / storyboards / links / storyboard first-frame images), preserves the
project-level character/scene/prop libraries, then re-plans from the batch's chapter events.
If the new episode count differs, following batches' `episodeNo` auto-renumber to stay
continuous. The delete + renumber run inside the agent's success transaction, so a provider
failure leaves the old episodes intact. Returns `202 Accepted`.

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
- call the configured runtime `ImageProvider`
- write `assets` rows
- update the corresponding target URL field
- support `force` through request body or query string; when `force` is false and the target already has an image URL, generation is skipped
- runtime image generation uses `OpenAICompatibleImageProvider`; tests inject `MockImageProvider`

### Single-target routes

#### `POST /api/characters/:characterId/generate-image`

Starts a character reference image task for one character. Builds the prompt from `characters.name`, `role`, `appearance`, `personality`, and project `visual_style`. Writes `asset_type = character_reference_image` and updates `characters.reference_image_url`. Returns `202 Accepted` with `{ taskId, status }`.

#### `POST /api/scenes/:sceneId/generate-image`

Starts a scene reference image task for one scene. Builds the prompt from `scenes.visual_prompt`, `name`, `description`, `location_type`, scene `visual_style`, and project `visual_style`. Writes `asset_type = scene_reference_image` and updates `scenes.reference_image_url`. Returns `202 Accepted`.

#### `POST /api/storyboards/:storyboardId/generate-first-frame`

Starts a storyboard first-frame task for one shot. Composes the prompt from `storyboards.image_prompt` plus linked scene and character context (including existing reference image URLs). Writes `asset_type = storyboard_first_frame` and updates `storyboards.first_frame_image_url`. Returns `202 Accepted`.

#### `POST /api/projects/:projectId/generate-image`

Starts an image generation task for one explicitly specified target. Accepts a body with `target_type` and `target_id`.

Supported `target_type` values:

- `character_reference_image`
- `scene_reference_image`
- `storyboard_first_frame`

Returns `202 Accepted`.

### Episode-level batch routes

Each batch route resolves all episode-linked targets, skips targets that already have an image unless `force=true`, generates images through the configured provider, and returns `200 OK` with a per-target summary.

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

## Task Stream (SSE) Routes

Implemented by `apps/server/routes/task-stream.ts` and `apps/server/services/task-stream-service.ts`. This is the primary real-time channel for async task progress; the per-task polling endpoints above remain as a fallback. Full contract in `docs/task-stream.md`.

### `GET /api/projects/:projectId/tasks/stream`

Opens a Server-Sent Events stream of task lifecycle updates for a project (`Content-Type: text/event-stream`). `404` if the project is not found.

Events:

- `snapshot` — pushed once on every (re)connect. `data` is `{ "tasks": [TaskEvent, ...] }` containing all active tasks (`pending`/`running`) plus tasks that reached a terminal state within the last `RECOVERABLE_TERMINAL_WINDOW_MS` (5 minutes). Clients rebuild their state from this, so page refresh / reconnection recover automatically without persisting `taskId` client-side.
- `task` — incremental update when a task changes status. `data` is a single `TaskEvent`; the SSE `id` is the task's `updatedAt`.
- `ping` — periodic (~15s) empty keep-alive; clients ignore it.

`TaskEvent` fields: `taskId`, `projectId`, `taskType`, `status` (`pending`/`running`/`completed`/`failed`), `targetType`, `targetId`, `episodeId`, `storyboardId`, `retryCount`, `errorMessage`, `updatedAt` (defined in `packages/tasks/task-event.ts`).

Events are emitted by the in-process `TaskWorker` (which implements `TaskEventBus`) at claim (`running`) and at run settlement (`completed`/`failed`/requeued). The bus is process-local; multi-process deployment would swap it for Redis Pub/Sub (or Postgres `LISTEN/NOTIFY`), on the same evolution line as the `TaskScheduler`→BullMQ swap.

## Later Phase 2 API Boundary

Do not add routes for the following unless the user explicitly requests expanding Phase 2 beyond Phase 2C:

- real image provider integration
- video generation
- TTS generation
- subtitle generation
- FFmpeg composition
- final episode video export
- bulk media job orchestration
