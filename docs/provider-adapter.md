# Provider Adapter

Model provider adapter integration specification.

## Text Provider

Phase 1 agents use `StructuredTextProvider` from `packages/providers/text-provider.ts`.

Responsibilities:

- accept system/user prompts
- return structured JSON
- validate output with the caller-provided Zod schema
- expose provider `name` and `model` for task and agent-run logging

`MockStructuredTextProvider` is the local MVP implementation used by the server composition root.

## Image Provider: Phase 2A/2B

Phase 2A adds `ImageProvider` in `packages/providers/image-provider.ts`. Phase 2B reuses it for character reference image generation only.

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

`MockImageProvider` is the only active Phase 2A/2B provider. It does not call a real image model and returns a deterministic local placeholder URL under `/static/mock-images/...`. Phase 2B character reference image tasks call this provider through `ImageGenerationService`.

## Boundary

Do not add OpenAI, Gemini, 即梦, 可灵, or other real image providers until Phase 2 is explicitly expanded beyond Phase 2B.
