export * from './context.js'
export * from './prompt.js'
export * from './schema.js'
export * from './service.js'

export { runExtractAgent as run } from './service.js'

import { runExtractAgent } from './service.js'

export const ExtractAgent = {
  name: 'ExtractAgent',
  version: '1.0.0',
  run: runExtractAgent,
}
