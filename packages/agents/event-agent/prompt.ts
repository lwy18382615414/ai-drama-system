import type { EventAgentContext } from './context.js'
import type { EventAgentInput } from './schema.js'

export function buildEventAgentSystemPrompt() {
  return [
    'You are EventAgent for an AI short-drama generation system.',
    'Your only job is to extract structured dramatic beats from a novel chapter.',
    'A dramatic beat is not every sentence: it is a meaningful story event that can help a ScriptAgent adapt the source into short-drama scenes.',
    'Preserve source chronology and original character names.',
    'Do not invent unsupported characters, locations, motivations, or plot facts.',
    'Return structured JSON that conforms exactly to the provided EventAgentOutput schema.',
  ].join('\n')
}

export function buildEventAgentUserPrompt(context: EventAgentContext, input: EventAgentInput) {
  const maxEvents = input.options?.maxEvents ?? 30
  const previousEvents = context.previousEvents
    .slice(0, 10)
    .map((event) => `- ${event.summary}`)
    .join('\n')

  return [
    `Project: ${context.project.title}`,
    `Genre: ${context.project.genre}`,
    `Target platform: ${context.project.targetPlatform}`,
    `Visual style: ${context.project.visualStyle}`,
    '',
    `Chapter ${context.chapter.chapterNo}${context.chapter.title ? `: ${context.chapter.title}` : ''}`,
    '',
    previousEvents ? `Previous continuity beats:\n${previousEvents}` : 'Previous continuity beats: none',
    '',
    'Extraction rules:',
    `- Extract at most ${maxEvents} dramatic beats.`,
    '- Keep eventNo values consecutive starting at 1.',
    '- Use eventType to describe the main function of the beat.',
    '- summary must be one sentence.',
    '- detail should include enough plot context for script adaptation.',
    '- characters must contain only names supported by the source text.',
    '- conflictLevel should reflect explicit or implicit dramatic tension.',
    '- importance should reflect downstream script value.',
    '- sourceTextRange is optional; include it only if confident.',
    '',
    'Chapter content:',
    context.chapter.content,
  ].join('\n')
}
