import { Request, Response, NextFunction } from 'express'

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>

export function asyncHandler(fn: AsyncRequestHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}
