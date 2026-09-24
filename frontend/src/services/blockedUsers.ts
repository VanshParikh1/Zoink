// Users blocked/unblocked during this app session. The backend already hides
// blocked users from every fetch; this only lets screens that hold cached
// results between focuses (e.g. SearchScreen's trending + recently viewed)
// drop them immediately without refetching.
const sessionBlockedIds = new Set<string>()

export function markBlocked(userId: string) {
  sessionBlockedIds.add(userId)
}

export function markUnblocked(userId: string) {
  sessionBlockedIds.delete(userId)
}

export function isBlockedThisSession(userId: string | null | undefined) {
  return Boolean(userId && sessionBlockedIds.has(userId))
}
