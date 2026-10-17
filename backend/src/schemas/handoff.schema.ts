import { z } from 'zod'
import { HANDOFF_PHOTOS_MAX, HANDOFF_PHOTOS_MIN } from '@zoink/shared'

/**
 * Handoff / "Zoink It" schemas.
 *
 * Field-name cross-check against Prisma schema:
 *   - handoffInitiatedAt  (pickup phase) — DateTime? — set server-side only
 *   - returnInitiatedAt   (return phase) — DateTime? — set server-side only
 *   - ownerPickupTappedAt / renterPickupTappedAt — set server-side only
 *   - ownerReturnTappedAt / renterReturnTappedAt — set server-side only
 *   - pickupPhotos / returnPhotos — String[] — Cloudinary URLs supplied by client
 *
 * No user-facing field name conflicts with the Phase 3 handoffInitiatedAt
 * field because clients supply 'photos' (array of URLs), not the timestamp.
 */

/** Shared: booking id param */
export const BookingIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
})

/** Shared: handoff phase enum used by multiple endpoints */
export const PhaseEnum = z.enum(['pickup', 'return'])

/**
 * POST /:id/pickup/initiate  and  POST /:id/return/initiate
 * Body: array of HANDOFF_PHOTOS_MIN–HANDOFF_PHOTOS_MAX Cloudinary photo URLs.
 */
export const InitiateHandoffSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
  body: z.object({
    photos: z
      .array(z.string().url('Each photo must be a valid URL.'))
      .min(HANDOFF_PHOTOS_MIN, `photos must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`)
      .max(HANDOFF_PHOTOS_MAX, `photos must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`),
  }),
})

/**
 * POST /:id/zoink-tap
 * Body: { phase: 'pickup' | 'return' }
 */
export const ZoinkTapSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
  body: z.object({
    phase: PhaseEnum,
  }),
})

/**
 * POST /:id/photos  (uploadHandoffPhotos — legacy endpoint)
 * Body: { phase, photoUrls?: [...], photos?: [...] }
 * At least one of photoUrls / photos must be present; the service
 * falls back from photoUrls to photos.
 */
export const UploadHandoffPhotosSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
  body: z
    .object({
      phase: PhaseEnum,
      photoUrls: z
        .array(z.string().url('Each photo must be a valid URL.'))
        .min(HANDOFF_PHOTOS_MIN, `photoUrls must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`)
        .max(HANDOFF_PHOTOS_MAX, `photoUrls must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`)
        .optional(),
      photos: z
        .array(z.string().url('Each photo must be a valid URL.'))
        .min(HANDOFF_PHOTOS_MIN, `photos must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`)
        .max(HANDOFF_PHOTOS_MAX, `photos must contain ${HANDOFF_PHOTOS_MIN} to ${HANDOFF_PHOTOS_MAX} URLs.`)
        .optional(),
    })
    .refine((data) => data.photoUrls !== undefined || data.photos !== undefined, {
      message: 'photoUrls or photos is required.',
      path: ['photoUrls'],
    }),
})
