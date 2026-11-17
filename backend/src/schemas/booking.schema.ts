import { z } from 'zod'
import { pageQuery } from '../utils/pagination'

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
 * API rather than merely defaulted (older app builds still send it; the route
 * drops it unread before validation, see routes/bookings.ts).
 * bookingService.createBooking() hardcodes
 * insuranceOptIn to false. Do not re-add this field to the schema without
 * updating terms.md and getting a lawyer's sign-off — see legal/OPEN-ITEMS.md B1.
 */

/**
 * POST /bookings
 * Dates are calendar days, the way the app sends them (BookingRequestScreen):
 * that day at exactly 00:00 UTC ("2026-10-20T00:00:00.000Z"). endDate is the
 * last day, inclusive, so a one-day rental has endDate === startDate; the
 * service bills inclusive days (bookingUtils.getRentalDays). Any other time
 * of day is refused: it was priced by its UTC day but checked against
 * "today" and the cancel cutoff by its Toronto day.
 * `message`, if present, is not stored on Booking (it has no message column) —
 * bookingService.createBooking posts it as the first Message in the
 * request's Conversation instead.
 */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/
const calendarDay = (field: string) =>
  z
    .string()
    .datetime({ message: `${field} must be a valid ISO-8601 datetime string.` })
    .regex(CALENDAR_DAY, `${field} must be a calendar day at 00:00 UTC, e.g. 2026-10-20T00:00:00.000Z.`)

export const CreateBookingSchema = z.object({
  body: z
    .object({
      listingId: z.string().min(1, 'listingId is required.'),
      startDate: calendarDay('startDate'),
      endDate: calendarDay('endDate'),
      message: z.string().max(500, 'message cannot exceed 500 characters.').optional(),
    })
    .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
      message: 'endDate cannot be before startDate.',
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

/**
 * GET /bookings/me, GET /bookings/requests. `limit` (or `cursor`) asks for a
 * page; without either the original unpaginated list (capped).
 */
export const BookingListQuerySchema = z.object({
  query: z.object({ ...pageQuery }),
})

/** GET /admin/bookings/:id/events: the timeline, oldest first; `limit` pages it. */
export const BookingEventsQuerySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Booking ID is required.'),
  }),
  query: z.object({ ...pageQuery }),
})
