/**
 * Maps backend machine-readable `errorCode`s (carried in the response envelope's
 * `data.errorCode`) to friendly Chinese messages. The backend keeps its English
 * error text for logs/tests; the UI shows these instead. Unmapped codes fall back
 * to the raw backend message.
 */
const ERROR_MESSAGES: Record<string, string> = {
  EPISODE_NO_SCENES: '该集还没有场景资产，请先在「剧本」页提取角色/场景/道具，再生成分镜',
  EPISODE_NO_CHARACTERS: '该集还没有角色资产，请先在「剧本」页提取角色/场景/道具，再生成分镜',
  SCRIPT_NOT_FOUND: '该集还没有剧本，请先在「剧本」页生成剧本',
  STORYBOARD_EXISTS: '该集已生成分镜，如需重做请使用「重新生成」',
  TARGET_IMAGE_EXISTS: '该图片已生成，如需重做请使用「重新生成（覆盖）」',
}

/** Extracts a mapped friendly message from an error envelope's `data`, if any. */
export function friendlyErrorMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'errorCode' in data) {
    const code = (data as { errorCode?: unknown }).errorCode
    if (typeof code === 'string') {
      return ERROR_MESSAGES[code]
    }
  }
  return undefined
}
