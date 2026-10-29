import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import type { MessageListItem } from '@zoink/shared'
import { appendNew, prependOlder, threadRows } from './chatThread'

function msg(id: string, senderId: string, createdAt: string): MessageListItem {
  return { id, senderId, body: id, createdAt } as unknown as MessageListItem
}

const ME = 'me'
const THEM = 'them'

describe('chat thread rows (inverted list)', () => {
  const messages = [
    msg('a', THEM, '2026-10-01T15:00:00'),
    msg('b', THEM, '2026-10-01T15:01:00'),
    msg('c', ME, '2026-10-01T15:02:00'),
    msg('d', ME, '2026-10-02T09:00:00'),
  ]

  test('newest message is row 0 and each day separator follows its messages', () => {
    const rows = threadRows(messages, ME)
    assert.deepEqual(
      rows.map((row) => row.key),
      ['d', 'day-' + new Date('2026-10-02T09:00:00').toDateString(), 'c', 'b', 'a', 'day-' + new Date('2026-10-01T15:00:00').toDateString()],
    )
  })

  test('sender groups are computed in time order, not display order', () => {
    const rows = threadRows(messages, ME).filter((row) => row.kind === 'message')
    const byId = Object.fromEntries(rows.map((row) => [row.key, row]))
    // a and b are one group from them: a starts it, b ends it (tail + time on b).
    assert.equal((byId.a as any).groupStart, true)
    assert.equal((byId.a as any).groupEnd, false)
    assert.equal((byId.b as any).groupStart, false)
    assert.equal((byId.b as any).groupEnd, true)
    // c is mine and alone; d is mine but on a new day, so its own group.
    assert.equal((byId.c as any).isMine, true)
    assert.equal((byId.c as any).groupStart, true)
    assert.equal((byId.d as any).groupStart, true)
  })
})

describe('chat thread paging', () => {
  test('an older page goes in front, without duplicates', () => {
    const current = [msg('c', ME, '2026-10-01T15:02:00'), msg('d', ME, '2026-10-01T15:03:00')]
    const older = [msg('a', THEM, '2026-10-01T15:00:00'), msg('b', THEM, '2026-10-01T15:01:00'), msg('c', ME, '2026-10-01T15:02:00')]
    assert.deepEqual(prependOlder(current, older).map((m) => m.id), ['a', 'b', 'c', 'd'])
  })

  test('a polled message already added by sending is not added twice', () => {
    const current = [msg('a', THEM, '2026-10-01T15:00:00'), msg('b', ME, '2026-10-01T15:01:00')]
    assert.equal(appendNew(current, [msg('b', ME, '2026-10-01T15:01:00')]), current)
    assert.deepEqual(appendNew(current, [msg('b', ME, '2026-10-01T15:01:00'), msg('c', THEM, '2026-10-01T15:02:00')]).map((m) => m.id), ['a', 'b', 'c'])
  })
})
