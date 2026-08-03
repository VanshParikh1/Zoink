import { z } from 'zod'

/**
 * Listing-domain request schemas.
 *
 * Cross-check against Prisma Listing model:
 *   - title         String
 *   - description   String
 *   - category      String
 *   - dailyPrice    Decimal(10,2)  — must be positive
 *   - itemValue     Decimal(10,2)  — optional, >= 0
 *   - depositAmount Decimal(10,2)  — optional, >= 0, owner-configured on the listing
 *   - isAvailable   Boolean        @default(true)
 *   - latitude    Float
 *   - longitude   Float
 *   - city        String
 *   - address     String?
 */

// ── Shared field definitions ──────────────────────────────────────────────────

const listingId = z.string().min(1, 'Listing ID is required.')
const imageId = z.string().min(1, 'Image ID is required.')

// ── POST /listings ────────────────────────────────────────────────────────────

export const CreateListingSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'title is required.'),
    description: z.string().min(1, 'description is required.'),
    category: z.string().min(1, 'category is required.'),
    dailyPrice: z.coerce
      .number({ error: 'dailyPrice must be a number.' })
      .positive('dailyPrice must be greater than 0.'),
    itemValue: z.coerce
      .number({ error: 'itemValue must be a number.' })
      .nonnegative('itemValue cannot be negative.')
      .optional(),
    depositAmount: z.coerce
      .number({ error: 'depositAmount must be a number.' })
      .nonnegative('depositAmount cannot be negative.')
      .optional(),
    latitude: z.coerce
      .number({ error: 'latitude must be a number.' })
      .min(-90, 'latitude must be >= -90.')
      .max(90, 'latitude must be <= 90.'),
    longitude: z.coerce
      .number({ error: 'longitude must be a number.' })
      .min(-180, 'longitude must be >= -180.')
      .max(180, 'longitude must be <= 180.'),
    city: z.string().min(1, 'city is required.'),
    address: z.string().optional(),
  }),
})


// ── PATCH /listings/:id ───────────────────────────────────────────────────────

export const UpdateListingSchema = z.object({
  params: z.object({ id: listingId }),
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    dailyPrice: z.coerce.number().positive().optional(),
    itemValue: z.coerce.number().nonnegative().optional(),
    depositAmount: z.coerce.number().nonnegative().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    city: z.string().min(1).optional(),
    address: z.string().optional(),
  }),
})

// ── PATCH /listings/:id/availability ─────────────────────────────────────────

export const ToggleAvailabilitySchema = z.object({
  params: z.object({ id: listingId }),
  body: z.object({
    isAvailable: z.boolean({ error: 'isAvailable must be a boolean.' }),
  }),
})


// ── GET /listings ─────────────────────────────────────────────────────────────
// Uses z.coerce so string query params are automatically converted to numbers.

const optionalNonNegativeNumber = z.coerce.number().nonnegative().optional()
const optionalPositiveNumber = z.coerce.number().positive().optional()
const optionalCoercedBoolean = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .transform((v) => v === true || v === 'true')
  .optional()

export const BrowseListingsQuerySchema = z
  .object({
    query: z.object({
      q: z.string().optional(),
      category: z.string().optional(),
      city: z.string().optional(),
      minPrice: optionalNonNegativeNumber,
      maxPrice: optionalNonNegativeNumber,
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: optionalPositiveNumber,
      limit: optionalPositiveNumber,
      offset: optionalNonNegativeNumber,
      includeUnavailable: optionalCoercedBoolean,
    }),
  })
  .superRefine((data, ctx) => {
    const { minPrice, maxPrice, latitude, longitude, radiusKm } = data.query
    const latProvided = latitude !== undefined
    const lngProvided = longitude !== undefined

    if (latProvided !== lngProvided) {
      ctx.addIssue({
        code: 'custom',
        path: ['query', latProvided ? 'longitude' : 'latitude'],
        message: 'latitude and longitude must be provided together.',
      })
    }

    if (radiusKm !== undefined && !latProvided) {
      ctx.addIssue({
        code: 'custom',
        path: ['query', 'radiusKm'],
        message: 'radiusKm requires latitude and longitude.',
      })
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['query', 'minPrice'],
        message: 'minPrice cannot be greater than maxPrice.',
      })
    }
  })

// ── GET/DELETE /listings/:id ──────────────────────────────────────────────────

export const ListingIdParamsSchema = z.object({
  params: z.object({ id: listingId }),
})

// ── DELETE /listings/:id/images/:imageId ──────────────────────────────────────

export const ListingImageParamsSchema = z.object({
  params: z.object({ id: listingId, imageId }),
})
