import type { EpisodePlannerContext } from './context.js'
import type { EpisodePlannerInput, EpisodePlannerSourceEvent } from './schema.js'

export function buildEpisodePlannerSystemPrompt() {
  return [
    'You are EpisodePlannerAgent for an AI short-drama generation system.',
    'Your only job is to group provided novel events into coherent short-drama episodes.',
    'Preserve source chronology and do not invent unsupported events, characters, or plot facts.',
    'Every provided novel_event_id must be linked exactly once across the planned episodes.',
    'Return structured JSON that conforms exactly to the provided EpisodePlannerOutput schema.',
  ].join('\n')
}

export function buildEpisodePlannerUserPrompt(
  context: EpisodePlannerContext,
  input: EpisodePlannerInput,
) {
  const sourceEvents = context.novelEvents.map(formatSourceEvent).join('\n')

  return [
    `Project: ${context.project.title}`,
    `Genre: ${input.styleConfig.genre}`,
    `Target platform: ${input.styleConfig.targetPlatform}`,
    `Visual style: ${input.styleConfig.visualStyle}`,
    `Target episode duration: ${input.styleConfig.episodeDuration} seconds`,
    '',
    'Planning rules:',
    '- Group the provided source events into one or more short-drama episodes.',
    '- Preserve the chronological order implied by chapterNo and eventNo.',
    '- Each episode must have title, summary, opening_hook, ending_hook, and source_event_links.',
    '- opening_hook should create immediate curiosity for the episode.',
    '- ending_hook should preserve a clear reason to watch the next episode when possible.',
    '- source_event_links must reference only provided novel_event_id values.',
    '- Every provided novel_event_id must appear exactly once across all source_event_links.',
    '- order_in_episode must be consecutive starting at 1 within each episode.',
    '- usage_type must be one of: primary, setup, payoff, supporting.',
    '',
    'Selected source events:',
    sourceEvents,
  ].join('\n')
}

function formatSourceEvent(event: EpisodePlannerSourceEvent) {
  const characters = event.characters.length > 0 ? event.characters.join(', ') : 'none'

  return [
    `- novel_event_id: ${event.id}`,
    `  chapterNo: ${event.chapterNo}`,
    `  eventNo: ${event.eventNo}`,
    `  eventType: ${event.eventType}`,
    `  summary: ${event.summary}`,
    `  detail: ${event.detail}`,
    `  characters: ${characters}`,
    event.location ? `  location: ${event.location}` : undefined,
    event.timeHint ? `  timeHint: ${event.timeHint}` : undefined,
    event.emotionTone ? `  emotionTone: ${event.emotionTone}` : undefined,
    event.conflictLevel ? `  conflictLevel: ${event.conflictLevel}` : undefined,
    event.importance ? `  importance: ${event.importance}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}
