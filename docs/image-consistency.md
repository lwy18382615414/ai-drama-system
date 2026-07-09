# Image Consistency (Characters / Scenes across shots)

How the system keeps the same character and scene looking the same across every
storyboard first frame in an episode, instead of the model re-inventing a person
(even flipping gender) from shot to shot.

## Problem

Shots are generated per-storyboard. Before this mechanism, a shot's referenced
character/scene assets were injected into the image prompt **as text only** — including
a useless `Character reference image: <url>` line that a text-to-image model cannot
follow. Each shot was therefore drawn from scratch off a thin appearance description, so
the same character drifted between shots.

## Approach

Feed the referenced assets' **reference-image pixels** into shot generation, not just
their text description. The pipeline was already asset-first (extract characters/scenes/
props → `StoryboardAgent` links each shot to asset IDs via `character_ids` / `scene_id` /
`prop_ids`); the only broken link was the final image step.

Two halves:

1. **Reference-conditioned generation.** A shot's characters (their reference images) plus
   its scene reference image are passed to the image model as reference pixels. Props stay
   text-only — objects dilute subject/scene fidelity and matter less visually.
2. **Prerequisite constraint.** Storyboard generation now requires at least one character
   linked to the episode (mirroring the existing "≥1 scene" rule), so shots always have a
   character anchor to condition on. It does **not** require every shot to have a character
   — establishing/scenery shots legitimately have none and rely on the scene reference.

## Mechanism

### Request path

- `ImageGenerationRequest.referenceImages?: string[]` — served asset URLs (`/static/...`),
  absolute local paths, remote `http(s)`, or `data:` URIs.
- `OpenAICompatibleImageProvider` resolves each reference to a **base64 data URI** (reads
  the local file under `STATIC_DIR`) and sends them on a non-standard `image` field. Base64
  is used so the model does not need public network access to `STATIC_DIR` — localhost works.
- Verified against the configured Seedream 5.0 proxy: the `image` field is passed through,
  base64 data URIs are accepted, and the output is strongly conditioned on the reference
  (same prompt with vs. without a reference yields the reference subject vs. a random one).

### Where references are assembled

`composeStoryboardFirstFramePrompt` (in `image-generation-service.ts`) returns
`{ prompt, referenceImages }`:

- `referenceImages` = the shot's characters' reference URLs, then the scene's, capped at
  `MAX_SHOT_REFERENCE_IMAGES` (6; characters take priority so people are never dropped).
- The prompt keeps named-subject **labels** (`Character: <name>`, `Scene: <name>`, appearance
  / description text) so the model can map each reference to who/where it is, but no longer
  embeds any reference-image URL as text.

### Auto-backfill of missing references (ordering)

A shot can only be conditioned on a reference image that already exists. The worker runs
tasks concurrently (default concurrency 2), so lazily generating a missing reference inside
a shot task would let two shots that share a character generate it twice.

Instead, references are ensured **synchronously, before shot tasks are enqueued**, by
`ensureShotReferenceImages`: it collects the distinct character/scene IDs across the target
shots, and for any lacking a reference image, generates it **serially and de-duplicated**.
The write-back means later shots reuse the freshly generated reference. No task-dependency
machinery is needed and the concurrent worker never double-generates.

This runs in all three shot-frame entry points before they create shot tasks / compose
prompts:

- single shot — `startImageGeneration` (storyboard target)
- async batch — `enqueueEpisodeStoryboardFirstFrames`
- inline batch — `generateEpisodeStoryboardFirstFrames`

### Persistence to the worker

For the async paths, `referenceImages` is stored in `generation_tasks.inputJson` so the
worker — which reconstructs the runner input from `inputJson` — passes the same references
to `executeImageGeneration` → the provider.

## Scope / non-goals

- **Old frames are left as-is.** This affects new generations only; users re-run
  "generate all (force)" to get consistency-conditioned versions of already-generated shots.
- **No downstream invalidation.** Regenerating a character/scene reference does not
  auto-mark dependent shots stale. Deferred as a separate feature.
- **Props are text-only**, never passed as reference images.

## Known upstream caveat

Consistency is only as good as the reference images. If asset extraction produced a poor
"character reference image" (e.g. a scene photo rather than a clean character portrait), the
mechanism will faithfully reproduce that wrong subject. Improving the quality of extracted
character reference images is a separate, upstream concern.
