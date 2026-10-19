import { z } from 'zod'
import { BadRequestError } from './errors'

// Cursor pagination for list endpoints, opt-in: a request that sends `limit`
// (or a `cursor`) gets one page, `{ items, nextCursor, … }`, trimmed to what
// the list screen renders. A request with neither gets the endpoint's original
// response, capped at LEGACY_LIST_CAP rows, so app builds released before
// pagination keep working without an unbounded payload.
//
// The cursor is the sort key of the page's last row, base64url-encoded JSON.
// Keyset pages don't shift when rows are added ahead of them, unlike offsets.

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50
export const LEGACY_LIST_CAP = 100

/** Spread into a query schema: `z.object({ ...pageQuery, … })`. */
export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(512).optional(),
}

export type PageParams = { limit?: number; cursor?: string }

export function isPaged(params: PageParams): boolean {
  return params.limit !== undefined || params.cursor !== undefined
}

export function pageSize(params: PageParams): number {
  return params.limit ?? DEFAULT_PAGE_SIZE
}

export function encodeCursor(key: readonly unknown[]): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url')
}

/** A cursor this server didn't hand out is a 400, never a 500. */
export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    throw new BadRequestError('Invalid cursor.')
  }
}

/** Callers fetch `size + 1` rows; the extra one only says another page exists. */
export function splitPage<T>(rows: T[], size: number, keyOf: (row: T) => readonly unknown[]) {
  const items = rows.slice(0, size)
  const last = items[items.length - 1]
  return { items, nextCursor: rows.length > size && last ? encodeCursor(keyOf(last)) : null }
}

// Most lists here are newest first by (createdAt, id); for those a Prisma
// `where` does the keyset, no raw SQL needed.
const createdAtCursor = z.tuple([z.string().datetime(), z.string().max(64)])

export function createdAtKey(row: { createdAt: Date; id: string }): [string, string] {
  return [row.createdAt.toISOString(), row.id]
}

/** Rows after the cursor in (createdAt, id) order, descending or ascending. */
export function createdAtAfter(cursor: string | undefined, direction: 'desc' | 'asc') {
  if (!cursor) return {}
  const [at, id] = decodeCursor(cursor, createdAtCursor)
  const createdAt = new Date(at)
  const past = direction === 'desc' ? 'lt' : 'gt'
  return { OR: [{ createdAt: { [past]: createdAt } }, { createdAt, id: { [past]: id } }] }
}

export function createdAtOrder(direction: 'desc' | 'asc') {
  return [{ createdAt: direction }, { id: direction }]
}
