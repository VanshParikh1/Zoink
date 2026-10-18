import { roundCurrency } from '@zoink/shared'
import { BadRequestError } from '../utils/errors'

// Card-network authorization holds on the Stripe PaymentIntent are only
// reliably valid for about a week — a rental longer than this risks the
// hold expiring before pickup/return capture. See disputeService.ts /
// paymentService.ts for the payment flows this constrains. Defined in
// @zoink/shared so the app's date picker enforces the same limit.
import { MAX_RENTAL_DAYS } from '@zoink/shared'
export { MAX_RENTAL_DAYS }

export { roundCurrency }

export function getRentalDays(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  const normalizedStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const normalizedEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  const diffDays = Math.round((normalizedEnd - normalizedStart) / msPerDay)
  return diffDays + 1
}

export function ensureValidBookingDates(startDate: Date, endDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  if (endDate < startDate) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  if (getRentalDays(startDate, endDate) > MAX_RENTAL_DAYS) {
    throw new BadRequestError(`Bookings cannot exceed ${MAX_RENTAL_DAYS} days.`)
  }
}
