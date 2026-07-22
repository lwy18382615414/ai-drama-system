# Provider Adapter

Model provider adapter integration specification.

## Text Provider

Phase 1 agents use `StructuredTextProvider` from `packages/providers/text-provider.ts`.

Responsibilities:

- accept system/user prompts
- return structured JSON
- validate output with the caller-provided Zod schema
- expose provider `name` and `model` for task and agent-run logging

Two implementations exist:

- `OpenAICompatibleTextProvider` (`packages/providers/openai-compatible-text-provider.ts`) — calls any OpenAI-compatible chat completion endpoint and returns validated structured JSON. This is the runtime provider.
- `MockStructuredTextProvider` — a deterministic test double, injected via DI in tests only. It is no longer wired into `apps/server/app.ts`.

The server composition root (`apps/server/app.ts`) always constructs the real provider and fails fast at startup if it is unconfigured:

- `TEXT_PROVIDER_API_KEY` — required
- `TEXT_PROVIDER_BASE_URL` — required
- `TEXT_PROVIDER_MODEL` — optional model override

Do not hardcode API keys; configure them through environment variables only. A smoke test is available via `npm run smoke:text-provider`.

## Image Provider: Phase 2A–2C

Phase 2A adds `ImageProvider` in `packages/providers/image-provider.ts`. Phase 2B–2C reuse it for character reference images, scene reference images, and storyboard first frames, including episode-level batch generation.

Responsibilities:

- accept an image prompt and optional generation parameters
- return an image URL
- expose provider `name` and `model` for `generation_tasks` and `assets` provenance

Interface shape:

- `ImageGenerationRequest`
  - `prompt`
  - optional `negativePrompt`
  - optional `width`
  - optional `height`
  - optional `style`
  - optional `referenceImages` — served asset URLs / local paths fed to the model as reference pixels for subject/scene consistency (see `docs/image-consistency.md`)
  - optional `metadata`
- `ImageGenerationResult`
  - `imageUrl`
  - `provider`
  - `model`
  - optional `raw`
- `ImageProvider.generateImage(request)`

`OpenAICompatibleImageProvider` (`packages/providers/openai-compatible-image-provider.ts`) is the runtime image provider. It calls an OpenAI-compatible `images.generate` endpoint (default model `gpt-image-2`), downloads the returned base64/URL image, writes it to `STATIC_DIR` (default `data/static`), and returns a `/static/...` URL that `app.ts` serves via `serveStatic`. All Phase 2B–2C image tasks (single-target and episode batch) call this provider through `ImageGenerationService`.

The composition root fails fast at startup if the image provider is unconfigured:

- `IMAGE_PROVIDER_API_KEY` — required
- `IMAGE_PROVIDER_BASE_URL` — required
- `IMAGE_PROVIDER_MODEL` — optional model override (default `gpt-image-2`)

When `referenceImages` are present, the provider resolves each to a base64 data URI and passes them on a non-standard `image` field the model honors for reference-conditioned generation (verified for Seedream via the configured proxy). This is how storyboard first frames keep characters and scenes visually consistent across shots — see `docs/image-consistency.md`.

`MockImageProvider` is retained only as a deterministic test double, injected via DI in tests. A smoke test is available via `npm run smoke:image-provider`.

## Boundary

Video, TTS, subtitle, FFmpeg, and final-export providers remain out of scope until Phase 2 is explicitly expanded beyond Phase 2C.

## Planned Provider Reliability Contract

The next refactor will extend adapters with a capability description (`structuredOutput`, `imageInput`, optional context/image-size limits) and centralized timeout, normalized failure classification, bounded exponential backoff, provider request-ID capture, token/image usage, cost estimation and moderation-result normalization. Adapters must also validate temporary-resource downloads against allowed protocol/domain, size, MIME type and timeout.

For structured text, a Zod validation failure may trigger one feedback-based JSON repair attempt; this repair is separate from task retries. Provider request IDs are audit data only: OpenAI-compatible proxies cannot generally be queried later for a completed request, so recovery depends on task idempotency, revision isolation and re-entrant asset persistence. The current fail-fast requirement for text and image provider configuration remains unchanged.
