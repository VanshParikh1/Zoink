export const BOOKING_DEPOSIT_RATE = 0.3

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function getRentalDays(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  const normalizedStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const normalizedEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  const diffDays = Math.round((normalizedEnd - normalizedStart) / msPerDay)
  return diffDays + 1
}

export function ensureValidBookingDates(startDate: Date, endDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('BOOKING_INVALID_DATES')
  }

  if (endDate < startDate) {
    throw new Error('BOOKING_INVALID_DATES')
  }
}

export function calculateDepositAmount(totalPrice: number) {
  return roundCurrency(totalPrice * BOOKING_DEPOSIT_RATE)
}
