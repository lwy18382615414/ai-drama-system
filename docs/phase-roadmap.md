# Phase Roadmap

## Current Status

Phase 1 is complete.

Phase 2B is active for the character reference image generation loop, built on the Phase 2A ImageProvider + image task infrastructure.

Later Phase 2 media generation remains paused.

Phase 3+ has not started.

Do not implement real image providers, video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2B.

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

## Phase 2A: Active ImageProvider + Image Task Infrastructure

Status: complete.

Scope:

- Add `ImageProvider` and `MockImageProvider`.
- Create image `generation_tasks` with `task_type = image_generation`.
- Track polymorphic image targets through `target_type` and `target_id`.
- Record generated image assets in `assets`.
- Update active image URL fields for:
  - `character_reference_image`
  - `scene_reference_image`
  - `storyboard_first_frame`

Boundary notes:

- Only `MockImageProvider` is active.
- No real image model integration is part of Phase 2A.
- Existing storyboard `image_prompt` remains a planning field used as input to mock image task infrastructure.

## Phase 2B: Active Character Reference Image Loop

Status: active.

Scope:

- Add `POST /api/characters/:characterId/generate-image` for one character at a time.
- Build prompts from character name, role, appearance, personality, and project `visual_style`.
- Use the existing async `generation_tasks` image task lifecycle.
- Use `MockImageProvider` only.
- Write `assets.asset_type = character_reference_image`.
- Update `characters.reference_image_url` when the task completes.
- Support `force=true` regeneration while avoiding duplicate work when a reference image already exists.

Boundary notes:

- Phase 2B does not activate scene image, storyboard first-frame, video, TTS, subtitle, FFmpeg, or final export workflows.
- No real image model integration is part of Phase 2B.

## Later Phase 2: Paused Media Generation Pipeline

Status: paused.

Do not implement unless explicitly requested.

Potential future areas:

- real image provider integration
- image prompt refinement
- video prompt refinement
- video generation
- TTS
- subtitles
- FFmpeg composition
- final episode video export
- object storage integration
- bulk media task orchestration

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
- `docs/phase-roadmap.md`
