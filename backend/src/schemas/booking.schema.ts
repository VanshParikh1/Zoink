import { z } from 'zod'

/**
 * Booking-domain request schemas.
 *
 * Cross-check against Prisma Booking model:
 *   - listingId   String
 *   - startDate   DateTime
 *   - endDate     DateTime
 *
 * insuranceOptIn/insuranceFee still exist as columns on Booking (see
 * schema.prisma), but Zoink offers no insurance product at launch — see
 * terms.md §12. That field is deliberately NOT accepted here: a client
 * can't set it even if it sends it, so the column is unreachable from the
 * API rather than merely defaulted. bookingService.createBooking() hardcodes
 * insuranceOptIn to false. Do not re-add this field to the schema without
 * updating terms.md and getting a lawyer's sign-off — see legal/OPEN-ITEMS.md B1.
 */

/**
 * POST /bookings
 * Requires listingId + ISO-8601 date strings; endDate must be after startDate.
 * `message`, if present, is not stored on Booking (it has no message column) —
 * bookingService.createBooking posts it as the first Message in the
 * request's Conversation instead.
 */
export const CreateBookingSchema = z.object({
  body: z
    .object({
      listingId: z.string().min(1, 'listingId is required.'),
      startDate: z.string().datetime({ message: 'startDate must be a valid ISO-8601 datetime string.' }),
      endDate: z.string().datetime({ message: 'endDate must be a valid ISO-8601 datetime string.' }),
      message: z.string().max(500, 'message cannot exceed 500 characters.').optional(),
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
