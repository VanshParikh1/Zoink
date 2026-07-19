import { Request, Response } from 'express'
import * as authService from '../../services/authService'
import { asyncHandler } from '../../utils/asyncHandler'

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  const result = await authService.registerUser(email, password, firstName, lastName)
  return res.status(201).json(result)
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }
  const result = await authService.loginUser(email, password)
  return res.status(200).json(result)
})

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body
  const userId = (req as any).userId // set by requireAuth middleware
  if (!code) {
    return res.status(400).json({ error: 'Verification code is required.' })
  }
  const result = await authService.verifyOTP(userId, code)
  return res.status(200).json(result)
})

export const resendOTP = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const result = await authService.resendOTP(userId)
  return res.status(200).json(result)
})