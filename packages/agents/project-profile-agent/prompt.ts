import type { ProjectProfileAgentContext } from './context.js'
import type { ProjectProfileAgentInput } from './schema.js'

const COMMON_GENRES = ['都市', '古装', '悬疑', '甜宠', '复仇', '重生', '玄幻', '战神', '豪门', '职场']

export function buildProjectProfileAgentSystemPrompt() {
  return [
    'You are ProjectProfileAgent for an AI short-drama production system.',
    'Your only job is to infer the production profile of a new short-drama project from the opening of its source novel.',
    'Base every field on the provided source text and metadata; do not invent plot facts.',
    'All output values must be written in Chinese.',
    'Return structured JSON that conforms exactly to the provided ProjectProfileAgentOutput schema.',
  ].join('\n')
}

export function buildProjectProfileAgentUserPrompt(
  context: ProjectProfileAgentContext,
  input: ProjectProfileAgentInput,
) {
  const meta = input.novelMeta
  const metaLines = [
    meta?.title ? `Source book title: ${meta.title}` : null,
    meta?.author ? `Source author: ${meta.author}` : null,
  ].filter((line): line is string => line !== null)

  return [
    'Infer the short-drama project profile for the following novel.',
    '',
    ...(metaLines.length > 0 ? [...metaLines, ''] : []),
    `Total imported chapters: ${context.chapterCount}`,
    'Chapter titles:',
    ...context.chapterTitles.map((title) => `- ${title}`),
    '',
    'Field requirements:',
    '- title: a short catchy short-drama title; reuse or adapt the book title if it already fits short-drama style.',
    '- description: 2-3 sentences pitching the story premise and central conflict for short-drama production.',
    `- genre: a short label; prefer one of ${COMMON_GENRES.join(' / ')} when applicable, otherwise a comparable concise label.`,
    '- visualStyle: an image-generation-friendly description of the visual look (era, palette, lighting, mood), one sentence.',
    '',
    'Opening text sample:',
    context.openingSample,
  ].join('\n')
}
