/** Pure, browser-safe replay of durable replacements. Originals remain in the log. */
import type { Message, UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'

export interface Replacement { index: number; description: string }
export interface Target { seq: SessionSeq; replacements: Replacement[] }

/**
 * Plugin-owned log records. Harness refuses to reload a stored session that contains an event
 * type outside its built-in vocabulary unless the event is marked `ignorable`, so both records are
 * written with `appendPluginRecord`, which stores them under the `plugin:` namespace with that
 * marker. A reader without this plugin skips them and keeps the original images.
 */
export const PROJECT_RECORD = 'plugin:image-to-text/project' as const
export const ARCHIVE_RECORD = 'plugin:image-to-text/archive' as const

export interface ArchiveRecord { original: UserMessage; replacement: UserMessage }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** @messageProjection Typed here only so the projection can name it; written as a plugin record. */
    'plugin:image-to-text/project': { targets: Target[] }
  }
  interface PluginRecordMap {
    'plugin:image-to-text/project': { targets: Target[] }
    'plugin:image-to-text/archive': ArchiveRecord
  }
}

export function replaceImages<T extends Message>(message: T, replacements: Replacement[]): T {
  const pending = new Map<number, string>()
  for (const item of replacements) {
    if (!Number.isSafeInteger(item.index) || item.index < 0 || pending.has(item.index)
      || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 65536) {
      throw new Error('image-to-text: invalid or duplicate image replacement')
    }
    pending.set(item.index, item.description)
  }
  let index = 0
  const content = message.content.map(block => {
    if (block.type !== 'image') return block
    const description = pending.get(index++)
    if (description === undefined) return block
    if (block.offloaded) throw new Error('image-to-text: cannot replace an already offloaded image')
    pending.delete(index - 1)
    return { type: 'text' as const, text: `[Image observation; original retained in session log]\n${description}\n[End image observation]` }
  })
  if (pending.size) throw new Error('image-to-text: replacement does not refer to an image')
  return { ...message, content } as T
}

export const imageToTextProjection: SessionMessageProjection<typeof PROJECT_RECORD> = {
  type: PROJECT_RECORD,
  project(event, context) {
    if (!event.data || !Array.isArray(event.data.targets) || !event.data.targets.length) {
      throw new Error('image-to-text: targets must be nonempty')
    }
    const result = new Map<SessionSeq, Message>()
    for (const target of event.data.targets) {
      if (!target || !Number.isSafeInteger(target.seq) || target.seq < 0 || result.has(target.seq)
        || !context.nodes.includes(target.seq) || !Array.isArray(target.replacements) || !target.replacements.length) {
        throw new Error('image-to-text: invalid projection target')
      }
      const source = context.events[target.seq - context.baseSeq]
      if (source?.type !== 'user/message' && source?.type !== 'tool/result') {
        throw new Error('image-to-text: target must be a user message or tool result')
      }
      const message = context.messages.get(target.seq)
        ?? (source.type === 'user/message' ? source.data : source.data.message)
      result.set(target.seq, replaceImages(message, target.replacements))
    }
    return result
  },
}
