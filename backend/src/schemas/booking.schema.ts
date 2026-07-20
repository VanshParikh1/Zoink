import { z } from 'zod'

/**
 * Booking-domain request schemas.
 *
 * Cross-check against Prisma Booking model:
 *   - listingId   String
 *   - startDate   DateTime
 *   - endDate     DateTime
 *   - message     String?
 *   - insuranceOptIn Boolean @default(false)
 */

/**
 * POST /bookings
 * Requires listingId + ISO-8601 date strings; endDate must be after startDate.
 */
export const CreateBookingSchema = z.object({
  body: z
    .object({
      listingId: z.string().min(1, 'listingId is required.'),
      startDate: z.string().datetime({ message: 'startDate must be a valid ISO-8601 datetime string.' }),
      endDate: z.string().datetime({ message: 'endDate must be a valid ISO-8601 datetime string.' }),
      message: z.string().optional(),
      insuranceOptIn: z.boolean().optional().default(false),
    })
    .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
      message: 'endDate must be after startDate.',
      path: ['endDate'],
    }),
})

/**
 * Routes that only use :id in params (GET, PATCH actions with no body).
 */
export const BookingIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
})
