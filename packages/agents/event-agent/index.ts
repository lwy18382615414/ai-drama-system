export * from './context.js'
export * from './prompt.js'
export * from './schema.js'
export * from './service.js'

export { runEventAgent as run } from './service.js'

import { runEventAgent } from './service.js'

export const EventAgent = {
  name: 'EventAgent',
  version: '1.0.0',
  run: runEventAgent,
}
