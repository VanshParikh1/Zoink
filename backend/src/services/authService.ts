import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from '../utils/prisma'

// ── Helpers ──────────────────────────────────────────────────────────────────

function isEmailDomainAllowed(email: string): boolean {
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())

  const domain = email.split('@')[1]?.toLowerCase()
  return allowedDomains.includes(domain)
}

function generateOTP(): string {
  // Generates a cryptographically random 6-digit code
  return crypto.randomInt(100000, 999999).toString()
}

function signJWT(userId: string, verificationStatus: string): string {
  return jwt.sign(
    { userId, verificationStatus },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' }
  )
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string
) {
  // 1. Check domain
  if (!isEmailDomainAllowed(email)) {
    throw new Error('EMAIL_DOMAIN_NOT_ALLOWED')
  }

  // 2. Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS')
  }

  // 3. Hash password
  const passwordHash = await bcrypt.hash(password, 12)

  // 4. Create user
  const user = await prisma.user.create({
    data: { email, passwordHash, firstName, lastName },
  })

  // 5. Generate and store OTP
  const code = generateOTP()
  const expiresAt = new Date(
    Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 15) * 60 * 1000
  )

  await prisma.verificationToken.create({
    data: { userId: user.id, code, expiresAt },
  })

  // 6. Send OTP email (stubbed until SES is configured)
  await sendVerificationEmail(user.email, user.firstName, code)

  // 7. Return JWT so the user is logged in immediately after registering
  const token = signJWT(user.id, user.verificationStatus)
  return { token, user: { id: user.id, email: user.email, firstName: user.firstName, verificationStatus: user.verificationStatus } }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  // 1. Find user
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  // 2. Check password
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS')
  }

  // 3. Return JWT
  const token = signJWT(user.id, user.verificationStatus)
  return { token, user: { id: user.id, email: user.email, firstName: user.firstName, verificationStatus: user.verificationStatus } }
}

// ── Verify OTP ────────────────────────────────────────────────────────────────

export async function verifyOTP(userId: string, code: string) {
  // Find the most recent unused token for this user
  const token = await prisma.verificationToken.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!token) {
    throw new Error('OTP_NOT_FOUND')
  }

  if (token.code !== code) {
    throw new Error('OTP_INVALID')
  }

  if (token.expiresAt < new Date()) {
    throw new Error('OTP_EXPIRED')
  }

  // Mark token as used and update user status in a transaction
  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
    }),
  ])

  // Return a fresh JWT with updated verificationStatus
  const token2 = signJWT(userId, 'VERIFIED')
  return { token: token2 }
}

// ── Resend OTP ────────────────────────────────────────────────────────────────

export async function resendOTP(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.verificationStatus === 'VERIFIED') throw new Error('ALREADY_VERIFIED')

  // Rate limit: block if a token was created in the last 60 seconds
  const recentToken = await prisma.verificationToken.findFirst({
    where: {
      userId,
      createdAt: { gt: new Date(Date.now() - 60 * 1000) },
    },
  })
  if (recentToken) throw new Error('RESEND_TOO_SOON')

  const code = generateOTP()
  const expiresAt = new Date(
    Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 15) * 60 * 1000
  )

  await prisma.verificationToken.create({
    data: { userId, code, expiresAt },
  })

  await sendVerificationEmail(user.email, user.firstName, code)
  return { message: 'OTP sent' }
}

// ── Email ────────────────────────────────────────────────────────────────────

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

async function sendVerificationEmail(email: string, firstName: string, code: string) {
  const command = new SendEmailCommand({
    Source: process.env.SES_FROM_EMAIL!,
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Your Zoink verification code',
      },
      Body: {
        Text: {
          Data: `Hi ${firstName},\n\nYour Zoink verification code is: ${code}\n\nIt expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`,
        },
        Html: {
          Data: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Your Zoink verification code</h2>
              <p>Hi ${firstName},</p>
              <p>Enter this code in the app to verify your student email:</p>
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; margin: 24px 0;">
                ${code}
              </div>
              <p style="color: #666;">Expires in 15 minutes. If you didn't request this, ignore this email.</p>
            </div>
          `,
        },
      },
    },
  })

  await sesClient.send(command)
}