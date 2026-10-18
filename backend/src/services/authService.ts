import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { Prisma, VerificationStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError,
} from '../utils/errors'
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/legal'
import { hasPlusInLocalPart, normalizeEmail, PLUS_ADDRESS_MESSAGE } from '../utils/email'
import { deleteUnverifiedAccounts } from './unverifiedAccounts'
import type { University } from '@zoink/shared'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Wrong guesses allowed per code before it's spent (see verifyOTP).
const MAX_OTP_ATTEMPTS = 5

// Verification emails per address in any 24 hours, sign-ups and resends
// together. With 5 guesses a code that caps guessing at 50 a day, so a 6-digit
// code can't be walked through by requesting code after code.
export const MAX_VERIFICATION_EMAILS_PER_DAY = 10
const RESEND_COOLDOWN_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// How long a code stays valid; the email states the same number.
function otpExpiryMinutes(): number {
  return Number(process.env.OTP_EXPIRY_MINUTES || 15)
}

// Records a verification email to `email`, or refuses it: over the daily cap
// for the address, or (a resend) within a minute of the last one. Counted per
// address in its own table, so the cap holds across a replaced sign-up and a
// server restart; the per-address lock stops two requests at once from both
// slipping under it.
async function reserveVerificationEmail(email: string, options: { cooldown: boolean }) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`verification-email:${email}`}))::text`
    const now = Date.now()
    const recent = await tx.verificationEmailSend.findMany({
      where: { email, createdAt: { gt: new Date(now - DAY_MS) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    if (recent.length >= MAX_VERIFICATION_EMAILS_PER_DAY) {
      throw new TooManyRequestsError('Too many codes have been sent to this email today. Please try again tomorrow.')
    }
    if (options.cooldown && recent[0] && recent[0].createdAt.getTime() > now - RESEND_COOLDOWN_MS) {
      throw new TooManyRequestsError('Please wait 60 seconds before requesting a new code.')
    }
    await tx.verificationEmailSend.create({ data: { email } })
  })
}

// A bcrypt hash of a throwaway string, at the same cost (12) as real password
// hashes. Login compares against it when the email has no live account, so a
// miss takes as long as a wrong password and response time doesn't reveal
// which emails are registered.
const TIMING_EQUALIZER_HASH = '$2b$12$arzA7SjXbBjFXvShAaRZdeuGCkXBXgoJDsqg8e522bgTMtNQ3sehK'

function codesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function generateOTP(): string {
  // Generates a cryptographically random 6-digit code
  return crypto.randomInt(100000, 999999).toString()
}

export function signJWT(
  userId: string,
  verificationStatus: string,
  email: string,
  firstName: string,
  role: string,
  termsVersion: string | null,
  privacyVersion: string | null
): string {
  return jwt.sign(
    { userId, verificationStatus, email, firstName, role, termsVersion, privacyVersion },
    process.env.JWT_SECRET!,
    // Verification (requireAuth, rateLimiter) accepts HS256 only.
    { algorithm: 'HS256', expiresIn: '30d' }
  )
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  phone: string,
  university: University,
  acceptedTermsVersion: string,
  acceptedPrivacyVersion: string,
  ageAttested: boolean
) {
  // 1. Reject a stale client — it means the user was never shown the terms
  // version we actually require, so their acceptance wouldn't cover it.
  // (The university/email domain match is enforced structurally in
  // RegisterSchema — see auth.schema.ts — before this ever runs.)
  if (acceptedTermsVersion !== CURRENT_TERMS_VERSION || acceptedPrivacyVersion !== CURRENT_PRIVACY_VERSION) {
    throw new BadRequestError('Please update the app to continue — our terms have changed.')
  }

  // Sign-up only: existing '+' accounts keep logging in and verifying. Thrown
  // here rather than in RegisterSchema so the app, which shows `error`, gets
  // this message instead of "Validation failed.".
  email = normalizeEmail(email)
  if (hasPlusInLocalPart(email)) {
    throw new BadRequestError(PLUS_ADDRESS_MESSAGE)
  }

  // 2. An address on a verified account is taken. One on an unverified sign-up
  // isn't: that account was never active, and keeping it would let anyone who
  // typed someone else's university email lock them out. This sign-up
  // replaces it (step 5).
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, verificationStatus: true } })
  if (existing?.verificationStatus === VerificationStatus.VERIFIED) {
    throw new ConflictError('An account with this email already exists.')
  }

  // 3. Count the verification email this sign-up sends against the address's
  // daily cap (no cooldown: someone fixing a typo can sign up again at once).
  await reserveVerificationEmail(email, { cooldown: false })

  // 4. Hash password
  const passwordHash = await bcrypt.hash(password, 12)

  // 5. Create the user, replacing an unverified sign-up for this address. The
  // new account gets a new id, so a session from the old sign-up can't carry
  // over into it once it's verified. Acceptance is stamped with a single
  // timestamp so all three columns agree on exactly when consent was given.
  const acceptedAt = new Date()
  const data = {
    email,
    passwordHash,
    firstName,
    lastName,
    phone,
    university,
    termsAcceptedAt: acceptedAt,
    termsVersion: acceptedTermsVersion,
    privacyAcceptedAt: acceptedAt,
    privacyVersion: acceptedPrivacyVersion,
    ageAttestedAt: ageAttested ? acceptedAt : null,
  }
  let user
  try {
    user = await prisma.$transaction(async (tx) => {
      if (existing) await deleteUnverifiedAccounts(tx, { id: existing.id })
      return tx.user.create({ data })
    })
  } catch (error) {
    // Another sign-up for this address got there first, or the unverified
    // account had activity and couldn't be replaced.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('An account with this email already exists.')
    }
    throw error
  }

  // 6. Generate and store OTP
  const code = generateOTP()
  const expiresAt = new Date(Date.now() + otpExpiryMinutes() * 60 * 1000)

  await prisma.verificationToken.create({
    data: { userId: user.id, code, expiresAt },
  })

  // 7. Send the OTP email in the background. sendVerificationEmail never
  // rejects (it logs SES failures itself), and the user can always resend
  // from the verification screen, so sign-up doesn't wait on SES latency.
  void sendVerificationEmail(user.email, user.firstName, code)

  // 8. Return JWT so the user is logged in immediately after registering
  const token = signJWT(user.id, user.verificationStatus, user.email, user.firstName, user.role, user.termsVersion, user.privacyVersion)
  return { token, user: { id: user.id, email: user.email, firstName: user.firstName, verificationStatus: user.verificationStatus, role: user.role } }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  // 1. Find user
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
  if (!user || user.deletedAt) {
    // A soft-deleted account's email is rewritten to a tombstone so this
    // lookup normally misses anyway; the deletedAt check is belt-and-braces.
    await bcrypt.compare(password, TIMING_EQUALIZER_HASH)
    throw new UnauthorizedError('Invalid email or password.')
  }

  // 2. Check password
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password.')
  }

  // 3. Return JWT
  const token = signJWT(user.id, user.verificationStatus, user.email, user.firstName, user.role, user.termsVersion, user.privacyVersion)
  return { token, user: { id: user.id, email: user.email, firstName: user.firstName, verificationStatus: user.verificationStatus, role: user.role } }
}

// ── Verify OTP ────────────────────────────────────────────────────────────────

export async function verifyOTP(userId: string, code: string) {
  // Find the most recent unused token for this user
  const token = await prisma.verificationToken.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!token) {
    throw new BadRequestError('No verification code found. Please request a new one.')
  }

  if (!codesMatch(token.code, code)) {
    // Counted atomically, so parallel guesses can't all read a stale count.
    const { failedAttempts } = await prisma.verificationToken.update({
      where: { id: token.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    })
    if (failedAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.verificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      throw new BadRequestError('Too many incorrect attempts. Please request a new code.')
    }
    throw new BadRequestError('Incorrect verification code.')
  }

  if (token.expiresAt < new Date()) {
    throw new BadRequestError('Verification code has expired. Please request a new one.')
  }

  // Mark the token used and verify the user together. The token is claimed
  // only while it's unused and under the attempt cap, so a right answer
  // racing the guess that hits the cap can't get through.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationToken.updateMany({
      where: { id: token.id, usedAt: null, failedAttempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { usedAt: new Date() },
    })
    if (claimed.count !== 1) {
      throw new BadRequestError('Too many incorrect attempts. Please request a new code.')
    }
    await tx.user.update({
      where: { id: userId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
    })
  })

  // Return a fresh JWT with updated verificationStatus
  // Re-fetch user to get email + firstName + role for the new token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, role: true, termsVersion: true, privacyVersion: true },
  })
  const token2 = signJWT(userId, 'VERIFIED', user!.email, user!.firstName, user!.role, user!.termsVersion, user!.privacyVersion)
  return { token: token2 }
}

// ── Legal versions ────────────────────────────────────────────────────────────

export function getLegalVersions() {
  return { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION }
}

// ── Resend OTP ────────────────────────────────────────────────────────────────

export async function resendOTP(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found.')
  if (user.verificationStatus === 'VERIFIED') throw new BadRequestError('Your account is already verified.')

  // A minute between codes, and the address's daily cap.
  await reserveVerificationEmail(user.email, { cooldown: true })

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + otpExpiryMinutes() * 60 * 1000)

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

// The first name is whatever the person typed at sign-up; in the HTML part it
// must stay text.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
          Data: `Hi ${firstName},\n\nYour Zoink verification code is: ${code}\n\nIt expires in ${otpExpiryMinutes()} minutes.\n\nIf you didn't request this, ignore this email.`,
        },
        Html: {
          Data: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Your Zoink verification code</h2>
              <p>Hi ${escapeHtml(firstName)},</p>
              <p>Enter this code in the app to verify your student email:</p>
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; margin: 24px 0;">
                ${code}
              </div>
              <p style="color: #666;">Expires in ${otpExpiryMinutes()} minutes. If you didn't request this, ignore this email.</p>
            </div>
          `,
        },
      },
    },
  })

  try {
    await sesClient.send(command)
  } catch (err: any) {
    // SES failed (sandbox restrictions, missing config, etc.). Outside
    // production the code is logged so local dev is never blocked; in
    // production it must never reach logs (or Sentry breadcrumbs).
    console.warn(`SES verification email failed: ${err?.message ?? err}`)
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] OTP for ${email}: ${code}`)
    }
  }
}