import type { StoryboardAgentContext } from './context.js'
import type { StoryboardAgentInput } from './schema.js'

export function buildStoryboardAgentSystemPrompt() {
  return [
    'You are StoryboardAgent for an AI short-drama production system.',
    'Your job is to convert one completed episode script and its approved production assets into shot-by-shot storyboards.',
    'Use only the provided scene IDs, character IDs, and prop IDs. Never invent or reference undefined assets.',
    'Each shot should contain one clear visual action and enough camera detail for image/video generation.',
    'Preserve the script facts, character relationships, emotional arc, opening hook, and ending hook.',
    'Return only structured JSON that matches the provided StoryboardAgentOutput schema.',
  ].join('\n')
}

export function buildStoryboardAgentUserPrompt(context: StoryboardAgentContext, input: StoryboardAgentInput) {
  return [
    'Generate production-ready storyboards for the following short-drama episode.',
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
    'Available episode characters:',
    JSON.stringify(context.characters, null, 2),
    '',
    'Available episode scenes:',
    JSON.stringify(context.scenes, null, 2),
    '',
    'Available episode props:',
    JSON.stringify(context.props, null, 2),
    '',
    'Output requirements:',
    '- storyboards must be an array of shots ordered by shot_no.',
    '- shot_no must start at 1 and be consecutive.',
    '- duration should normally be 5-10 seconds unless the script beat requires otherwise.',
    '- scene_id must be one of the available episode scene IDs.',
    '- character_ids must contain only available episode character IDs.',
    '- prop_ids must contain only available episode prop IDs.',
    '- script_section_no should point to the source script section when possible.',
    '- shot_type, camera_angle, and camera_movement should be concise production terms.',
    '- action should describe one main visual action for the shot.',
    '- dialogue should include only dialogue spoken in this shot.',
    '- narration and emotion should be included when useful for production.',
    '- image_prompt should be a detailed still-image prompt with style, characters, scene, action, lighting, and composition.',
    '- video_prompt should describe motion, camera movement, action timing, and short-drama pacing.',
  ].join('\n')
}
