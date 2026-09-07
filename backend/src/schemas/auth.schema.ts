import { z } from 'zod'
import { UNIVERSITY_DOMAINS, UNIVERSITY_LABELS, type University } from '@zoink/shared'

/**
 * Auth-domain request schemas.
 *
 * The university email allowlist (UNIVERSITY_DOMAINS) lives in
 * packages/shared/src/universities.ts so backend validation and the frontend
 * picker/inline check can't drift from each other. Structural + domain
 * validation both happen here in Zod — the frontend's client-side check is
 * a UX nicety only, never trusted on its own.
 */

// ── POST /auth/register ───────────────────────────────────────────────────────

// Accepts 10-digit Canadian/NANP numbers with optional +1/1 prefix and optional
// formatting: "(416) 555-0192", "416-555-0192", "4165550192", "+1 416 555 0192".
// Area code can't start with 0 or 1, per NANP.
const CANADIAN_PHONE_REGEX = /^(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return `+1${tenDigits}`
}

const UNIVERSITY_KEYS = Object.keys(UNIVERSITY_DOMAINS) as [University, ...University[]]

export const RegisterSchema = z.object({
  body: z
    .object({
      email: z.string().email('A valid email address is required.'),
      password: z.string().min(8, 'Password must be at least 8 characters.'),
      firstName: z.string().min(1, 'firstName is required.').max(50, 'firstName cannot exceed 50 characters.'),
      lastName: z.string().min(1, 'lastName is required.').max(50, 'lastName cannot exceed 50 characters.'),
      phone: z
        .string()
        .trim()
        .min(1, 'Phone number is required.')
        .regex(CANADIAN_PHONE_REGEX, 'Enter a valid 10-digit Canadian phone number, e.g. (416) 555-0192.')
        .transform(normalizePhone),
      university: z.enum(UNIVERSITY_KEYS, { message: 'Select your university from the list.' }),
      acceptedTermsVersion: z.string().min(1),
      acceptedPrivacyVersion: z.string().min(1),
      ageAttested: z.literal(true, { message: 'You must confirm you are 18 or older.' }),
    })
    .superRefine((data, ctx) => {
      const domain = UNIVERSITY_DOMAINS[data.university]
      if (!data.email.toLowerCase().endsWith(`@${domain}`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['email'],
          message: `Please use your ${UNIVERSITY_LABELS[data.university]} student email (@${domain}).`,
        })
      }
    }),
})

// ── POST /auth/login ──────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  body: z.object({
    email: z.string().email('A valid email address is required.'),
    password: z.string().min(1, 'password is required.'),
  }),
})

// ── POST /auth/verify-email ───────────────────────────────────────────────────

export const VerifyEmailSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Verification code is required.'),
  }),
})
