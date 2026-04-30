import { Request, Response } from 'express'
import * as userService from '../../services/userService'
import { uploadImage } from '../../utils/cloudinary'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    USER_NOT_FOUND: { status: 404, message: 'User not found.' },
  }
  const mapped = map[message]
  if (mapped) return res.status(mapped.status).json({ error: mapped.message })
  console.error('Unhandled error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

// GET /users/me
export async function getMe(req: Request, res: Response) {
  const userId = (req as any).userId
  try {
    const user = await userService.getMe(userId)
    return res.json(user)
  } catch (error) {
    return handleError(res, error)
  }
}

// GET /users/:id
export async function getPublicProfile(req: Request, res: Response) {
  const id = req.params.id as string
  try {
    const user = await userService.getPublicProfile(id)
    return res.json(user)
  } catch (error) {
    return handleError(res, error)
  }
}

// PATCH /users/me
export async function updateMe(req: Request, res: Response) {
  const userId = (req as any).userId
  const { firstName, lastName, phone, bio } = req.body
  try {
    const user = await userService.updateMe(userId, { firstName, lastName, phone, bio })
    return res.json(user)
  } catch (error) {
    return handleError(res, error)
  }
}

// POST /users/me/avatar
export async function uploadAvatar(req: Request, res: Response) {
  const userId = (req as any).userId
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }
  try {
    const url = await uploadImage(req.file.buffer, 'avatars', `avatar_${userId}`)
    const user = await userService.updateAvatar(userId, url)
    return res.json(user)
  } catch (error) {
    return handleError(res, error)
  }
}

// PATCH /users/me/push-token
export async function updatePushToken(req: Request, res: Response) {
  const userId = (req as any).userId
  const { expoPushToken } = req.body as { expoPushToken?: unknown }

  if (expoPushToken !== null && expoPushToken !== undefined && typeof expoPushToken !== 'string') {
    return res.status(400).json({ error: 'expoPushToken must be a string or null.' })
  }

  try {
    const user = await userService.updateExpoPushToken(userId, expoPushToken ?? null)
    return res.json(user)
  } catch (error) {
    return handleError(res, error)
  }
}
