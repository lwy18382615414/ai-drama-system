# Video Generation — Design Outline (not yet implemented)

Status: **design only**. This is a paused-phase design note. Do not implement until the
user explicitly requests expanding Phase 2 beyond Phase 2C (see `CLAUDE.md` and
`docs/phase-roadmap.md`). Captured from a design review; every decision below has a recorded
rationale so implementation can follow without re-litigating.

The guiding principle throughout: **video generation is the shot-level (storyboard) parallel of
the existing image-generation phase**, and it reuses the same `generation_tasks` + `assets` +
provider-adapter + SSE-progress machinery wherever possible.

## 1. Generation paradigm — single-first-frame image-to-video (I2V)

- Input: a shot's existing `storyboards.firstFrameImageUrl` + a motion prompt.
- Rejected: text-to-video (throws away all first-frame consistency work — reference images,
  appearance-version chains, face-consistency) and first+last-frame interpolation (narrows the
  provider field, doubles image work, and re-opens the "where does the end frame come from and how
  is it kept consistent" problem already solved on the image side).
- Reserved for later: `VideoProvider` carries an **optional** `lastFrameImageUrl` param and the
  schema keeps `storyboards.lastFrameImageUrl`, so first+last-frame is a future additive upgrade,
  not a rewrite.

## 2. Provider execution model — async two-phase (submit + poll)

- Video APIs (Kling / Runway / Seedance / etc.) are job-based and take minutes.
- `VideoProvider` splits into `submitJob()` → returns a `jobId`, and `pollJob(jobId)` → returns
  status + final URL.
- Rejected: synchronous-blocking provider (would hold a worker slot for minutes) and webhook
  callbacks (no public callback address in the single-process MVP; belongs on the same evolution
  line as `TaskScheduler → BullMQ` and the event bus `→ Redis`).

## 3. Worker integration — submit-and-release + independent poll loop

- The handler only **submits** the job, persists `jobId`, sets the task to a new intermediate
  status **`awaiting_provider`**, and returns immediately — freeing the concurrency slot.
- A **separate poll loop** (not bounded by the `concurrency=2` cap) scans `awaiting_provider`
  tasks, checks provider status, and on success downloads + finalizes `running → completed`.
- Rationale: the concurrency cap exists to limit *concurrent heavy provider requests*; a task that
  is merely waiting for a result is not load and must not consume that scarce slot.
- **Crash recovery**: `jobId` is persisted on submit; `recover()` must **resume polling** an
  already-submitted job, never re-submit it (re-submitting burns money on a job already running
  provider-side and orphans the first `jobId`). The `awaiting_provider` state is what lets
  `recover()` reset only tasks still stuck *before* submission.
- This poll loop is another in-process interim implementation on the `→ BullMQ / → Redis`
  evolution line.

## 4. Dependency gating — default gate, explicit opt-in for auto-fill

- The first frame is a **human review checkpoint**, not a disposable intermediate like a reference
  image. Video is the most expensive, slowest step; animating an unreviewed auto-generated frame
  builds the costliest operation on the least-trusted input.
- Default: a shot with no `firstFrameImageUrl` is **skipped and reported**, not auto-generated.
  - `POST /api/storyboards/:id/generate-video` → `409 FIRST_FRAME_MISSING` when no first frame.
  - `POST /api/episodes/:id/generate-videos` → shots without a first frame go into `skipped` with a
    reason; the rest enqueue normally.
- Opt-in: `ensureFirstFrame=true` runs the existing `ensureShotReferenceImages` + first-frame
  generation chain to fill gaps before enqueuing video (caller owns the cost/no-review tradeoff).

## 5. Motion prompt — deterministic composition, motion-focused

- Compose at generation time (mirrors `composeStoryboardFirstFramePrompt` on the image side), not
  a raw field pass-through and not a new LLM agent.
- The first-frame image already carries all *static* info (identity, scene, composition, lighting).
  The motion prompt must describe **change only** — camera movement, action, emotion/pacing — and
  must **not** re-describe static appearance (doing so fights the first frame and induces drift).
- Source fields: `storyboards.videoPrompt` (StoryboardAgent already authors this as a motion
  description per its prompt: "describe motion, camera movement, action timing, and short-drama
  pacing") as the body, augmented by the structured `cameraMovement` field when present.
- Reserved for later: the paused "video prompt refinement" agent can drop in by replacing the
  deterministic composition with agent output — no structural change.

## 6. Duration & aspect ratio

- **Duration**: `storyboards.duration` is arbitrary integer seconds; I2V models support discrete
  tiers (typically 5s / 10s). The `VideoProvider` adapter declares its supported tier table and
  **quantizes** the requested duration to the nearest tier. The upper layer always passes intent
  (desired seconds); the adapter translates — same philosophy as the rest of the provider-adapter
  design. The aligned value is recorded in `outputJson` for debugging.
- **Aspect ratio**: derived from the **first frame's actual dimensions**, not from project config.
  Video aspect must equal first-frame aspect or the model crops/stretches and distorts. Project
  `targetPlatform` / `visualStyle` only influence dimensions at *first-frame* generation time; the
  video step follows the frame.

## 7. Retry & cost safety — failure-class-aware, video cap = 1

- The current worker retries blindly (`maxRetries=2`, up to 3 runs). For a paid multi-minute
  operation that risks 3× spend on a deterministically-failing input.
- `VideoProvider` errors carry a discriminable class: `transient` (submit-phase network / 429 /
  5xx / timeout — no cost incurred, safe to retry) vs `permanent` (submit-time 4xx content/param
  rejection, or a job accepted and then reported `failed` — retrying just burns money).
- `maybeRetry` becomes failure-class aware (a general improvement that also benefits image/text),
  retrying only `transient` failures. Video retry cap = **1**.

## 8. Scope boundary — per-shot clips only

- This phase delivers one video clip per shot, written to `storyboards.videoUrl`. Full stop.
- **Out of scope** (stay null, deferred to a future composition phase): `storyboards.composedVideoUrl`,
  `episodes.videoUrl`, episode-level stitching, FFmpeg composition, TTS, subtitles, final export.
  Stitching belongs with FFmpeg composition (a separate paused area) and is pointless before TTS /
  subtitles exist (audio would force a re-stitch). Per `CLAUDE.md`, FFmpeg composition / final
  export must not be implemented without explicit direction.

## Data-model deltas (follow the image-phase pattern)

- New enum values: `target_type = 'storyboard_video'`, `task_type = 'video_generation'`,
  `asset_type = 'storyboard_video'`.
- New task status: `awaiting_provider` (between `running`/submit and terminal).
- Downloaded clip written to `STATIC_DIR` (same `serveStatic`); **never** store the provider's
  temporary URL (they expire). `assets` records provenance; `storyboards.videoUrl` holds the final
  `/static/...` URL.
- `jobId` persisted in `generation_tasks.outputJson` on submit; poll loop reads it back.
- Routes parallel to the image phase: single-shot + episode-batch generate, plus
  `GET /api/episodes/:id/video-generation-status`.
