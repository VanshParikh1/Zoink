import type { MessageListItem } from '@zoink/shared'

const DAY_MS = 24 * 60 * 60 * 1000

// A poll that was already in flight when a message was sent can return that
// message too; keep one copy per id.
export function appendNew(current: MessageListItem[], incoming: MessageListItem[]) {
  const seen = new Set(current.map((message) => message.id))
  const fresh = incoming.filter((message) => !seen.has(message.id))
  return fresh.length > 0 ? [...current, ...fresh] : current
}

// An older page goes in front of what's loaded, minus anything already there.
export function prependOlder(current: MessageListItem[], older: MessageListItem[]) {
  const seen = new Set(current.map((message) => message.id))
  return [...older.filter((message) => !seen.has(message.id)), ...current]
}

export type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: MessageListItem; isMine: boolean; groupStart: boolean; groupEnd: boolean }

/** "Today", "Yesterday", "Oct 20" (plus the year when it isn't this year). Upper-cased by type.eyebrow. */
export function dayLabel(date: Date, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= startOfToday) return 'Today'
  if (date.getTime() >= startOfToday - DAY_MS) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/**
 * Day separators plus sender groups: consecutive messages from the same person
 * on the same day form one group, and only its last bubble gets the tail
 * corner and the time. Oldest first, as the messages are.
 */
export function buildRows(messages: MessageListItem[], myId: string | undefined): Row[] {
  const rows: Row[] = []
  let lastDay = ''
  messages.forEach((message, index) => {
    const date = new Date(message.createdAt)
    const day = date.toDateString()
    const prev = messages[index - 1]
    const next = messages[index + 1]
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(date) })
      lastDay = day
    }
    const sameAsPrev = Boolean(prev) && prev.senderId === message.senderId && new Date(prev.createdAt).toDateString() === day
    const sameAsNext = Boolean(next) && next.senderId === message.senderId && new Date(next.createdAt).toDateString() === day
    rows.push({
      kind: 'message',
      key: message.id,
      message,
      isMine: message.senderId === myId,
      groupStart: !sameAsPrev,
      groupEnd: !sameAsNext,
    })
  })
  return rows
}

/**
 * The rows for the inverted thread list: newest first, so index 0 sits on the
 * composer and each day's separator comes after its messages (shown above them).
 */
export function threadRows(messages: MessageListItem[], myId: string | undefined): Row[] {
  return buildRows(messages, myId).reverse()
}
