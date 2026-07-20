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

export const RegisterSchema = z.object({
  body: z.object({
    email: z.string().email('A valid email address is required.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    firstName: z.string().min(1, 'firstName is required.'),
    lastName: z.string().min(1, 'lastName is required.'),
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
