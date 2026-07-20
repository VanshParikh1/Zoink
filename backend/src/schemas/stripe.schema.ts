import { z } from 'zod'

/**
 * Stripe-domain schemas.
 *
 * NOTE: The Stripe webhook endpoints (POST /stripe/webhook and
 * POST /api/stripe/webhook) receive a raw Buffer body for signature
 * verification and are intentionally excluded from Zod body validation.
 * The Stripe SDK's constructEvent() performs its own payload validation.
 *
 * NOTE: capture_method is always set to 'manual' internally in
 * paymentService.createPaymentIntent() — it is never user-supplied,
 * so there is no body schema required for existing Stripe routes.
 *
 * This file exports schemas for any future Stripe API routes that
 * do accept user input (e.g. admin capture override, refund amount).
 */

/** Strict enum — 'manual' is the only accepted capture method. */
export const CaptureMethodSchema = z.enum(['manual'])

/**
 * If a future route ever accepts a partial capture amount,
 * use this schema for the body.
 */
export const PartialCaptureBody = z.object({
  body: z.object({
    amountCents: z.number().int().positive(),
    captureMethod: CaptureMethodSchema.optional(),
  }),
})

/** Currency must be a valid ISO 4217 lowercase code. */
export const CurrencySchema = z.string().length(3).toLowerCase()
