import { NextFunction, Request, Response } from 'express'

/**
 * Cache-Control for authenticated reads of public listing data.
 *
 * `revalidate`: the answer differs by viewer (blocked owners are hidden, the
 * owner sees the exact pickup point), so only the phone may keep a copy
 * (private) and it must check back every time (no-cache). Express's ETag
 * turns an unchanged answer into a 304 with no body.
 *
 * `cacheFor(seconds)`: the same for everyone and slow to change, so the phone
 * may reuse it without asking for a while.
 */
export function revalidate(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'private, no-cache')
  next()
}

export function cacheFor(seconds: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set('Cache-Control', `private, max-age=${seconds}`)
    next()
  }
}
