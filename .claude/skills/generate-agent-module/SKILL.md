---
name: generate-agent-module
description: Generate or update an AI Agent module for the AI short-drama system. Use this when implementing EventAgent, ScriptAgent, StoryboardAgent, PromptAgent, ReviewAgent, or other workflow agents.
---

# Generate Agent Module

## Goal

Implement or update one Agent module in the AI short-drama generation system.

## Required References

Before coding, read:

- `CLAUDE.md`
- `docs/architecture.md`
- `docs/agent-workflow.md`
- `docs/database-design.md`

## Required Steps

1. Identify the target Agent.
2. Define its responsibility.
3. Define input schema using Zod.
4. Define output schema using Zod.
5. Implement context builder if needed.
6. Implement Agent service.
7. Persist output to the correct business table.
8. Save run metadata to `agent_runs`.
9. Handle validation failure.
10. Return a typed result to the caller.

## Recommended File Structure

Use this pattern:

packages/agents/
  <agent-name>/
    index.ts
    schema.ts
    context.ts
    service.ts
    prompt.ts

## Hard Rules

- Do not place long prompts inside route handlers.
- Do not return raw model output without validation.
- Do not skip `agent_runs` logging.
- Do not call provider SDKs directly from Agent business logic.
- Use provider adapters.
- Keep Agent input and output stable.

## Final Response Format

After implementation, summarize:

- files changed
- new schemas
- database writes
- validation logic
- how to test