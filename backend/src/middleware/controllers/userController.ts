import { Request, Response } from 'express'
import * as userService from '../../services/userService'
import * as paymentService from '../../services/paymentService'
import { uploadImage } from '../../utils/cloudinary'
import { asyncHandler } from '../../utils/asyncHandler'

// GET /users/me
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const user = await userService.getMe(userId)
  return res.json(user)
})

// GET /users/:id
export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const user = await userService.getPublicProfile(id)
  return res.json(user)
})

// PATCH /users/me
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { firstName, lastName, phone, bio } = req.body
  const user = await userService.updateMe(userId, { firstName, lastName, phone, bio })
  return res.json(user)
})

// POST /users/me/avatar
export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }
  const url = await uploadImage(req.file.buffer, 'avatars', `avatar_${userId}`)
  const user = await userService.updateAvatar(userId, url)
  return res.json(user)
})

// PATCH /users/me/push-token
export const updatePushToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { expoPushToken } = req.body as { expoPushToken?: unknown }

  if (expoPushToken !== null && expoPushToken !== undefined && typeof expoPushToken !== 'string') {
    return res.status(400).json({ error: 'expoPushToken must be a string or null.' })
  }

  const user = await userService.updateExpoPushToken(userId, expoPushToken ?? null)
  return res.json(user)
})

// POST /users/me/stripe-connect/onboard
export const onboardStripeConnect = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const existingAccountId = await userService.getStripeAccountId(userId)
  const { accountId, url } = await paymentService.createConnectAccountLink(existingAccountId)
  
  if (accountId && accountId !== existingAccountId) {
    await userService.updateStripeAccountId(userId, accountId)
  }

  return res.json({ url })
})

// GET /users/me/stripe-connect/status
export const getStripeConnectStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const accountId = await userService.getStripeAccountId(userId)
  if (!accountId) {
    return res.json({ connected: false, chargesEnabled: false, detailsSubmitted: false, payoutsEnabled: false })
  }

  const status = await paymentService.getConnectAccountStatus(accountId)
  return res.json(status)
})
