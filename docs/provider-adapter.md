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

- `MockStructuredTextProvider` — the local fallback, returns deterministic structured output without calling a model.
- `OpenAICompatibleTextProvider` (`packages/providers/openai-compatible-text-provider.ts`) — calls any OpenAI-compatible chat completion endpoint and returns validated structured JSON.

The server composition root (`apps/server/app.ts`) selects the provider from environment variables:

- `TEXT_PROVIDER_API_KEY` set → `OpenAICompatibleTextProvider`
  - `TEXT_PROVIDER_BASE_URL` — required when the API key is set
  - `TEXT_PROVIDER_MODEL` — optional model override
- otherwise → `MockStructuredTextProvider`

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
  - optional `metadata`
- `ImageGenerationResult`
  - `imageUrl`
  - `provider`
  - `model`
  - optional `raw`
- `ImageProvider.generateImage(request)`

`MockImageProvider` is the only active image provider. It does not call a real image model and returns a deterministic local placeholder URL under `/static/mock-images/...`. All Phase 2B–2C image tasks (single-target and episode batch) call this provider through `ImageGenerationService`.

## Boundary

Do not add OpenAI, Gemini, 即梦, 可灵, or other real image providers until Phase 2 is explicitly expanded beyond Phase 2C.
