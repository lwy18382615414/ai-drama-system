# Phase Roadmap

## Current Status

Phase 1 is complete.

Phase 2 is paused.

Phase 3+ has not started.

Do not implement image generation, video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests resuming Phase 2.

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

## Phase 2: Paused Media Generation Pipeline

Status: paused.

Do not implement unless explicitly requested.

Potential future areas:

- image prompt refinement
- image generation
- video prompt refinement
- video generation
- TTS
- subtitles
- FFmpeg composition
- final episode video export
- media asset storage integration
- media task orchestration

Boundary notes:

- Existing storyboard `image_prompt` and `video_prompt` fields are Phase 1 planning outputs.
- Existing media URL columns are reserved for future media workflows.
- No provider calls for image, video, audio, subtitle, or composition work should be added while Phase 2 is paused.

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
