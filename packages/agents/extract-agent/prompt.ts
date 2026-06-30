import type { ExtractAgentContext } from './context.js'
import type { ExtractAgentInput } from './schema.js'

export function buildExtractAgentSystemPrompt() {
  return [
    'You are ExtractAgent for an AI short-drama production system.',
    'Your job is to extract reusable production assets from one completed episode script: characters, scenes, and props.',
    'Extract only assets that appear, are mentioned, or are clearly needed for production in this episode.',
    'Prefer existing project asset names when an asset already exists. Do not create duplicate names for the same asset.',
    'Do not overwrite stable character, scene, or prop canon; provide missing details only when useful.',
    'Return only structured JSON that matches the provided ExtractAgentOutput schema.',
  ].join('\n')
}

export function buildExtractAgentUserPrompt(context: ExtractAgentContext, input: ExtractAgentInput) {
  return [
    'Extract production assets from the following short-drama episode script.',
    '',
    'Project style:',
    JSON.stringify(input.projectStyle, null, 2),
    '',
    'Episode:',
    JSON.stringify(
      {
        id: context.episode.id,
        episode_no: context.episode.episodeNo,
        title: context.episode.title,
        summary: context.episode.summary,
        opening_hook: context.episode.openingHook,
        ending_hook: context.episode.endingHook,
        status: context.episode.status,
      },
      null,
      2,
    ),
    '',
    'Script metadata:',
    JSON.stringify(
      {
        id: context.script.id,
        title: context.script.title,
        summary: context.script.summary,
        opening_hook: context.script.openingHook,
        ending_hook: context.script.endingHook,
        status: context.script.status,
      },
      null,
      2,
    ),
    '',
    'Script content:',
    context.script.content,
    '',
    'Script structured JSON:',
    JSON.stringify(context.scriptStructuredJson, null, 2),
    '',
    'Existing project characters:',
    JSON.stringify(context.existingCharacters, null, 2),
    '',
    'Existing project scenes:',
    JSON.stringify(context.existingScenes, null, 2),
    '',
    'Existing project props:',
    JSON.stringify(context.existingProps, null, 2),
    '',
    'Output requirements:',
    '- characters: people/personas appearing or clearly mentioned in this episode; include aliases, role, visual/personality/background notes when available.',
    '- scenes: locations/settings needed to shoot this episode; include location_type, visual_style, and visual_prompt when useful.',
    '- props: physical or narratively significant objects needed in this episode; include significance and visual_prompt when useful.',
    '- usage_type should describe how the episode uses the asset, e.g. protagonist, antagonist, supporting, location, key_prop, mentioned, used.',
    '- Use concise production-facing descriptions. Avoid creating duplicate entries for the same name.',
  ].join('\n')
}
