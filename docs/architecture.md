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

Future media output, currently paused in Phase 2:

- image prompts and refined visual prompts
- generated images
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
episodes + episode_event_links
↓
scripts
↓
characters + scenes + props
↓
storyboards

### Phase 1A EventAgent

`novel_chapters → novel_events`

Extracts structured story events from source chapter text.

### Phase 1B EpisodePlannerAgent

`novel_events → episodes + episode_event_links`

Groups source events into short-drama episodes and records the ordered event links used by each episode.

### Phase 1C ScriptAgent

`episodes + linked novel_events → scripts`

Rewrites each planned episode and its linked events into an adapted short-drama script.

### Phase 1D ExtractAgent

`scripts → characters + scenes + props`

Extracts reusable production assets from scripts and links them back to the episode.

### Phase 1E StoryboardAgent

`scripts + characters + scenes + props → storyboards`

Creates shot-level storyboards from the script and extracted assets.

## Active Scope: Phase 2B

Phase 2A provides ImageProvider + image task infrastructure. Phase 2B activates only the character reference image generation loop.

The active Phase 2B flow is:

characters
↓
character reference image request
↓
`generation_tasks` image task
↓
`MockImageProvider`
↓
`assets` record with `asset_type = character_reference_image`
↓
`characters.reference_image_url` update

Active generated target:

- `character_reference_image`

Scene reference images, storyboard first frames, and later media workflows remain paused. No real image model provider is active in Phase 2B.

## Paused Scope: Later Phase 2

Later Phase 2 is paused. Do not implement real image provider integration, video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2B.

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

Storyboard rows may already contain `image_prompt` and `video_prompt` planning fields, but these fields do not mean Phase 2 provider calls are active.

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
- database persistence
- agent run logging

Phase 2B currently exercises the image provider adapter, task status persistence, database persistence, asset provenance records, and character reference image URL updates. Object storage, real media provider adapters, FFmpeg composition, and final video export remain later Phase 2+ concerns and are currently paused.

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
