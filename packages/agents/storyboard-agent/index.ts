export * from './context.js'
export * from './prompt.js'
export * from './schema.js'
export * from './service.js'

export { runStoryboardAgent as run } from './service.js'

import { runStoryboardAgent } from './service.js'

export const StoryboardAgent = {
  name: 'StoryboardAgent',
  version: '1.0.0',
  run: runStoryboardAgent,
}
