import { z } from 'zod'
import { DEPOSIT_MIN, ITEM_VALUE_MAX } from '@zoink/shared'
import { pageQuery } from '../utils/pagination'

/**
 * Listing-domain request schemas.
 *
 * Cross-check against Prisma Listing model:
 *   - title         String
 *   - description   String
 *   - category      String
 *   - dailyPrice    Decimal(10,2)  — must be positive
 *   - itemValue     Decimal(10,2)  — optional, 0 to ITEM_VALUE_MAX ($1,000, pilot cap)
 *   - depositAmount Decimal(10,2)  — optional, 0 (none) or DEPOSIT_MIN ($1) up to itemValue, owner-configured on the listing
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

const depositNotOverItemValue = {
  message: 'depositAmount cannot exceed itemValue.',
  path: ['depositAmount'] as PropertyKey[],
}

const depositAtLeastMinimum = {
  message: 'depositAmount must be at least 1, or 0 for no deposit.',
  path: ['depositAmount'] as PropertyKey[],
}

const depositIsNoneOrAtLeastMinimum = (data: { depositAmount?: number }) =>
  data.depositAmount === undefined || data.depositAmount === 0 || data.depositAmount >= DEPOSIT_MIN

const itemValueRequiredForDeposit = {
  message: 'itemValue is required when depositAmount is set.',
  path: ['itemValue'] as PropertyKey[],
}

export const CreateListingSchema = z.object({
  body: z
    .object({
      title: z.string().min(1, 'title is required.').max(80, 'title cannot exceed 80 characters.'),
      description: z
        .string()
        .min(1, 'description is required.')
        .max(1000, 'description cannot exceed 1000 characters.'),
      category: z.string().min(1, 'category is required.').max(40, 'category cannot exceed 40 characters.'),
      dailyPrice: z.coerce
        .number({ error: 'dailyPrice must be a number.' })
        .positive('dailyPrice must be greater than 0.')
        .max(1000, 'dailyPrice cannot exceed 1000.'),
      itemValue: z.coerce
        .number({ error: 'itemValue must be a number.' })
        .nonnegative('itemValue cannot be negative.')
        .max(ITEM_VALUE_MAX, 'itemValue cannot exceed 1000.')
        .optional(),
      depositAmount: z.coerce
        .number({ error: 'depositAmount must be a number.' })
        .nonnegative('depositAmount cannot be negative.')
        .max(ITEM_VALUE_MAX, 'depositAmount cannot exceed itemValue.')
        .optional(),
      latitude: z.coerce
        .number({ error: 'latitude must be a number.' })
        .min(-90, 'latitude must be >= -90.')
        .max(90, 'latitude must be <= 90.'),
      longitude: z.coerce
        .number({ error: 'longitude must be a number.' })
        .min(-180, 'longitude must be >= -180.')
        .max(180, 'longitude must be <= 180.'),
      city: z.string().min(1, 'city is required.').max(60, 'city cannot exceed 60 characters.'),
      address: z.string().max(200, 'address cannot exceed 200 characters.').optional(),
    })
    .refine(
      (data) => data.depositAmount === undefined || data.itemValue === undefined || data.depositAmount <= data.itemValue,
      depositNotOverItemValue
    )
    .refine(
      (data) => data.depositAmount === undefined || data.itemValue !== undefined,
      itemValueRequiredForDeposit
    )
    .refine(depositIsNoneOrAtLeastMinimum, depositAtLeastMinimum),
})


// ── PATCH /listings/:id ───────────────────────────────────────────────────────

export const UpdateListingSchema = z.object({
  params: z.object({ id: listingId }),
  body: z
    .object({
      title: z.string().min(1).max(80).optional(),
      description: z.string().min(1).max(1000).optional(),
      category: z.string().min(1).max(40).optional(),
      dailyPrice: z.coerce.number().positive().max(1000).optional(),
      itemValue: z.coerce.number().nonnegative().max(ITEM_VALUE_MAX, 'itemValue cannot exceed 1000.').optional(),
      depositAmount: z.coerce.number().nonnegative().max(ITEM_VALUE_MAX, 'depositAmount cannot exceed itemValue.').optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      city: z.string().min(1).max(60).optional(),
      address: z.string().max(200).optional(),
    })
    .refine(
      (data) => data.depositAmount === undefined || data.itemValue === undefined || data.depositAmount <= data.itemValue,
      depositNotOverItemValue
    )
    .refine(
      (data) => data.depositAmount === undefined || data.itemValue !== undefined,
      itemValueRequiredForDeposit
    )
    .refine(depositIsNoneOrAtLeastMinimum, depositAtLeastMinimum),
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
const optionalPriceFilter = z.coerce.number().nonnegative().max(1000).optional()
const optionalCoercedBoolean = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .transform((v) => v === true || v === 'true')
  .optional()

export const BrowseListingsQuerySchema = z
  .object({
    query: z.object({
      q: z.string().max(100, 'q cannot exceed 100 characters.').optional(),
      category: z.string().max(40, 'category cannot exceed 40 characters.').optional(),
      city: z.string().max(60, 'city cannot exceed 60 characters.').optional(),
      minPrice: optionalPriceFilter,
      maxPrice: optionalPriceFilter,
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: optionalPositiveNumber,
      limit: optionalPositiveNumber,
      offset: optionalNonNegativeNumber,
      // From the previous page's nextCursor (cursor pages; see browseListingsPage).
      cursor: pageQuery.cursor,
      includeUnavailable: optionalCoercedBoolean,
    }),
  })
  .superRefine((data, ctx) => {
    const { minPrice, maxPrice, latitude, longitude, radiusKm, cursor, offset } = data.query

    if (cursor !== undefined && offset !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['query', 'offset'],
        message: 'Send either cursor or offset, not both.',
      })
    }
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

// ── GET /listings/me ──────────────────────────────────────────────────────────
// `limit` (or `cursor`) asks for a page; without either, the original list (capped).

export const MyListingsQuerySchema = z.object({
  query: z.object({ ...pageQuery }),
})
