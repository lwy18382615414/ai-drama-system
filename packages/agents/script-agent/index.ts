export * from './context.js'
export * from './prompt.js'
export * from './schema.js'
export * from './service.js'

export { runScriptAgent as run } from './service.js'

import { runScriptAgent } from './service.js'

export const ScriptAgent = {
  name: 'ScriptAgent',
  version: '1.0.0',
  run: runScriptAgent,
}
