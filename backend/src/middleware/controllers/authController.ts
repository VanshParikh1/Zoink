import { Request, Response } from 'express'
import * as authService from '../../services/authService'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'

  const map: Record<string, { status: number; message: string }> = {
    EMAIL_DOMAIN_NOT_ALLOWED: { status: 400, message: 'Email domain not allowed. Please use your university email.' },
    EMAIL_ALREADY_EXISTS:     { status: 409, message: 'An account with this email already exists.' },
    INVALID_CREDENTIALS:      { status: 401, message: 'Invalid email or password.' },
    OTP_NOT_FOUND:            { status: 400, message: 'No verification code found. Please request a new one.' },
    OTP_INVALID:              { status: 400, message: 'Incorrect verification code.' },
    OTP_EXPIRED:              { status: 400, message: 'Verification code has expired. Please request a new one.' },
    ALREADY_VERIFIED:         { status: 400, message: 'Your account is already verified.' },
    RESEND_TOO_SOON:          { status: 429, message: 'Please wait 60 seconds before requesting a new code.' },
    USER_NOT_FOUND:           { status: 404, message: 'User not found.' },
  }

  const mapped = map[message]
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message })
  }

  console.error('Unhandled error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

export async function register(req: Request, res: Response) {
  const { email, password, firstName, lastName } = req.body
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  try {
    const result = await authService.registerUser(email, password, firstName, lastName)
    return res.status(201).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }
  try {
    const result = await authService.loginUser(email, password)
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function verifyEmail(req: Request, res: Response) {
  const { code } = req.body
  const userId = (req as any).userId // set by requireAuth middleware
  if (!code) {
    return res.status(400).json({ error: 'Verification code is required.' })
  }
  try {
    const result = await authService.verifyOTP(userId, code)
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function resendOTP(req: Request, res: Response) {
  const userId = (req as any).userId
  try {
    const result = await authService.resendOTP(userId)
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}