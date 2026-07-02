export * from './context.js'
export * from './prompt.js'
export * from './schema.js'
export * from './service.js'

export { runProjectProfileAgent as run } from './service.js'

import { runProjectProfileAgent } from './service.js'

export const ProjectProfileAgent = {
  name: 'ProjectProfileAgent',
  version: '1.0.0',
  run: runProjectProfileAgent,
}
