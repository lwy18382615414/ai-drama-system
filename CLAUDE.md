# CLAUDE.md

## Project Overview

This repository implements an AI short-drama generation platform.

The system converts novels or story outlines into structured short-drama production assets:

novel text → chapter events → adapted script → characters/scenes/props → storyboards → image prompts → video prompts → image/video generation tasks → TTS/subtitles → FFmpeg composition → final episode video.

## Current Implementation Status

Phase 1 is complete. The completed backend narrative pipeline is:

novel_chapters → novel_events → episodes + episode_event_links → scripts → characters/scenes/props → storyboards.

Phase 2B is active only for character reference image generation using `MockImageProvider`. Do not implement real image providers, scene images, storyboard first-frame generation, video generation, TTS, subtitles, FFmpeg composition, final video export, or related media-generation routes/services unless the user explicitly requests expanding Phase 2 beyond Phase 2B.

See `docs/phase-roadmap.md` for the current phase roadmap.

## Core Architecture

Use this architecture unless the user explicitly asks to change it:

- Frontend: Vue 3 / Vite / TypeScript
- Backend: Node.js / TypeScript / Hono
- Database: SQLite for MVP, PostgreSQL later
- ORM: Drizzle
- Validation: Zod
- Async tasks: task table for MVP, BullMQ later
- Storage: local `data/static` for MVP, S3/R2/COS later
- Video processing: FFmpeg
- AI integration: Provider Adapter pattern

## Core Concepts

The system is built around:

1. Multi-Agent workflow
2. Project memory
3. Character memory
4. Plot memory
5. Skill-file based reusable workflows
6. Structured JSON outputs
7. Provider adapters for text/image/video/audio models
8. Agent run logging and task status tracking

## Development Rules

- Every Agent output must be structured JSON.
- Every JSON output must have a Zod schema.
- Every long-running generation must create a task record.
- Do not call AI providers directly from route handlers.
- Use provider adapters.
- Store reusable workflow rules in Skill files.
- Store long design notes in `docs/`.
- Keep `CLAUDE.md` concise and stable.
- Do not hardcode API keys.
- Do not bypass database logging for Agent runs.
- Do not introduce a new framework without explaining the reason.

## Important Docs

Before implementing related modules, read these files:

- `docs/architecture.md`
- `docs/database-design.md`
- `docs/agent-workflow.md`
- `docs/api-design.md`
- `docs/provider-adapter.md`
- `docs/phase-roadmap.md`

## Done Definition

A backend feature is done only when:

- route is implemented
- service layer is implemented
- Zod input/output schema exists
- database writes are transactional where needed
- task status is persisted for async work
- error handling is explicit
- at least one smoke test or usage example exists
