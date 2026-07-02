# Phase Roadmap

## Current Status

Phase 1 is complete, including project management routes and the Vue 3 workbench frontend.

Phase 2A (image task infrastructure), Phase 2B (character reference image loop), and Phase 2C (scene reference images, storyboard first frames, and episode-level batch image generation) are complete.

At runtime both providers are real and required, and fail fast at startup if unconfigured:
- Text: `OpenAICompatibleTextProvider` via `TEXT_PROVIDER_*` environment variables.
- Image: `OpenAICompatibleImageProvider` (default model `gpt-image-2`) via `IMAGE_PROVIDER_*` environment variables; generated images are written to `STATIC_DIR` (default `data/static`) and served under `/static`.

`MockStructuredTextProvider` and `MockImageProvider` are retained only as test doubles.

Later Phase 2 media generation remains paused.

Phase 3+ has not started.

Do not implement video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2C.

## Phase 1: Completed Backend Narrative Pipeline

Phase 1 covers the backend chain from source novel chapters to editable storyboard records.

### Phase 1A: EventAgent

`novel_chapters → novel_events`

Status: complete.

Purpose:

- Extract structured source events from imported chapter text.
- Persist ordered event rows for downstream episode planning.

### Phase 1B: EpisodePlannerAgent

`novel_events → episodes + episode_event_links`

Status: complete.

Purpose:

- Group source events into short-drama episodes.
- Persist episode records and ordered links back to the source events.

### Phase 1C: ScriptAgent

`episodes + linked novel_events → scripts`

Status: complete.

Purpose:

- Rewrite each planned episode into an adapted script.
- Persist structured script content for extraction and storyboard generation.

### Phase 1D: ExtractAgent

`scripts → characters + scenes + props`

Status: complete.

Purpose:

- Extract production assets from scripts.
- Persist or reuse project-level characters, scenes, and props.
- Link assets back to the episode.

### Phase 1E: StoryboardAgent

`scripts + characters + scenes + props → storyboards`

Status: complete.

Purpose:

- Convert scripts and extracted assets into ordered shot-level storyboards.
- Persist storyboard planning fields, including `image_prompt` and `video_prompt`, without starting media generation.

## Text Provider Integration

Status: complete.

Scope:

- Add `OpenAICompatibleTextProvider` in `packages/providers/openai-compatible-text-provider.ts`, implementing `StructuredTextProvider` against any OpenAI-compatible chat completion endpoint.
- Construct the provider in the server composition root (`apps/server/app.ts`) through required environment variables:
  - `TEXT_PROVIDER_API_KEY` — required
  - `TEXT_PROVIDER_BASE_URL` — required
  - `TEXT_PROVIDER_MODEL` — optional model override
- Provide a smoke test via `npm run smoke:text-provider` (`scripts/smoke-test-text-provider.ts`).

Boundary notes:

- This applies to structured text generation for the Phase 1 agents only.
- Image generation has its own required `OpenAICompatibleImageProvider` runtime configuration.

## Phase 2A: Active ImageProvider + Image Task Infrastructure

Status: complete.

Scope:

- Add `ImageProvider`, `OpenAICompatibleImageProvider`, and `MockImageProvider` test coverage.
- Create image `generation_tasks` with `task_type = image_generation`.
- Track polymorphic image targets through `target_type` and `target_id`.
- Record generated image assets in `assets`.
- Update active image URL fields for:
  - `character_reference_image`
  - `scene_reference_image`
  - `storyboard_first_frame`

Boundary notes:

- `OpenAICompatibleImageProvider` is active at runtime and fails fast when unconfigured.
- `MockImageProvider` is retained only as a deterministic test double.
- Existing storyboard `image_prompt` remains a planning field used as input to image task infrastructure.

## Phase 2B: Character Reference Image Loop

Status: complete.

Scope:

- Add `POST /api/characters/:characterId/generate-image` for one character at a time.
- Build prompts from character name, role, appearance, personality, and project `visual_style`.
- Use the existing async `generation_tasks` image task lifecycle.
- Use the configured `ImageProvider` adapter.
- Write `assets.asset_type = character_reference_image`.
- Update `characters.reference_image_url` when the task completes.
- Support `force=true` regeneration while avoiding duplicate work when a reference image already exists.

Boundary notes:

- Runtime image generation uses `OpenAICompatibleImageProvider`; tests inject `MockImageProvider`.

## Phase 2C: Scene, Storyboard First-Frame, and Batch Image Generation

Status: complete.

Scope:

- Add `POST /api/scenes/:sceneId/generate-image` for one scene at a time.
  - Build prompts from scene `visual_prompt`, name, description, location type, scene `visual_style`, and project `visual_style`.
  - Update `scenes.reference_image_url` when the task completes.
- Add `POST /api/storyboards/:storyboardId/generate-first-frame` for one storyboard shot at a time.
  - Compose prompts from the storyboard `image_prompt` plus linked scene and character context, including existing reference image URLs.
  - Update `storyboards.first_frame_image_url` when the task completes.
- Add episode-level batch generation routes:
  - `POST /api/episodes/:episodeId/generate-character-images`
  - `POST /api/episodes/:episodeId/generate-scene-images`
  - `POST /api/episodes/:episodeId/generate-storyboard-first-frames`
  - `POST /api/episodes/:episodeId/generate-all-images`
  - Batch routes iterate over episode-linked targets, skip targets that already have an image unless `force=true`, and return a per-target summary.
- Add `GET /api/episodes/:episodeId/image-generation-status` for episode-level image progress counts.
- All generation uses the configured runtime image provider and the same `generation_tasks` + `assets` lifecycle as Phase 2B.

Boundary notes:

- Phase 2C does not activate video, TTS, subtitle, FFmpeg, or final export workflows.

## Later Phase 2: Paused Media Generation Pipeline

Status: paused.

Do not implement unless explicitly requested.

Potential future areas:

- image prompt refinement
- video prompt refinement
- video generation
- TTS
- subtitles
- FFmpeg composition
- final episode video export
- object storage integration

## Phase 3+

Status: not started.

Potential future work may include advanced workbench editing, review loops, project memory expansion, production pipeline automation, and deployment hardening. These phases are not active and should not be implemented without explicit direction.

## Documentation Maintenance Rule

When phase status changes, update all of the following files together:

- `CLAUDE.md`
- `docs/architecture.md`
- `docs/agent-workflow.md`
- `docs/database-design.md`
- `docs/api-design.md`
- `docs/provider-adapter.md`
- `docs/phase-roadmap.md`
