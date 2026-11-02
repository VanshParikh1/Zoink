// Pure helpers for the stored session token. No React Native imports, so the
// node test runner can load them (sessionToken.test.ts).

/** The JWT's payload, or null when the token isn't a decodable JWT. */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

/** True once the token's `exp` (seconds) has passed. A token without `exp` is
 *  left for the server to judge. */
export function isJwtExpired(payload: { exp?: unknown }, nowMs: number = Date.now()): boolean {
  return typeof payload.exp === 'number' && payload.exp * 1000 <= nowMs
}

/** Whether a failed request means the signed-in session is over: a 401 for a
 *  request that was sent with the session token that is still current. A 401
 *  from logging in (no token sent) or from a request made with an older token
 *  (one still in flight from before a fresh login) doesn't end anything. */
export function endsCurrentSession(
  status: number | undefined,
  sentAuthorization: unknown,
  currentToken: string | null | undefined
): boolean {
  return status === 401 && !!currentToken && sentAuthorization === `Bearer ${currentToken}`
}
