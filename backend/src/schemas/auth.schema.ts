import { z } from 'zod'

/**
 * Auth-domain request schemas.
 *
 * University domain validation (isEmailDomainAllowed) stays in
 * authService.registerUser() — it is business logic that depends on
 * the ALLOWED_EMAIL_DOMAINS env var, not structural validation.
 * Zod only guards structural correctness here.
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

export const RegisterSchema = z.object({
  body: z.object({
    email: z.string().email('A valid email address is required.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    firstName: z.string().min(1, 'firstName is required.'),
    lastName: z.string().min(1, 'lastName is required.'),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone number is required.')
      .regex(CANADIAN_PHONE_REGEX, 'Enter a valid 10-digit Canadian phone number, e.g. (416) 555-0192.')
      .transform(normalizePhone),
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
