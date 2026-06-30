import type { ScriptAgentContext } from './context.js'
import type { ScriptAgentInput } from './schema.js'

export function buildScriptAgentSystemPrompt() {
  return [
    'You are ScriptAgent for an AI short-drama production system.',
    'Your job is to convert one planned episode and its ordered source novel events into a shootable short-drama script.',
    'Preserve the source facts, character intent, emotional progression, and event order. Do not invent unsupported plot turns.',
    'Write for short-video pacing: strong opening hook, compact conflict escalation, and a clear ending hook.',
    'Return only structured JSON that matches the provided ScriptAgentOutput schema.',
  ].join('\n')
}

export function buildScriptAgentUserPrompt(context: ScriptAgentContext, input: ScriptAgentInput) {
  return [
    'Generate a short-drama script for the following planned episode.',
    '',
    'Project style config:',
    JSON.stringify(input.styleConfig, null, 2),
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
    'Ordered source events:',
    JSON.stringify(
      context.orderedSourceEvents.map(({ link, event }) => ({
        order_in_episode: link.orderInEpisode,
        usage_type: link.usageType,
        novel_event_id: event.id,
        event_no: event.eventNo,
        event_type: event.eventType,
        summary: event.summary,
        detail: event.detail,
        characters: event.characters,
        location: event.location,
        time_hint: event.timeHint,
        emotion_tone: event.emotionTone,
        conflict_level: event.conflictLevel,
        importance: event.importance,
      })),
      null,
      2,
    ),
    '',
    'Output requirements:',
    `- duration_seconds should be close to ${input.styleConfig.episodeDuration} seconds.`,
    '- script_sections must be ordered with section_no consecutive from 1.',
    '- Each section should describe one production-friendly dramatic beat.',
    '- dialogues should contain character lines when characters speak; narration can be used for voice-over or transition text.',
    '- Keep opening_hook and ending_hook highly engaging for short-video viewers.',
  ].join('\n')
}
