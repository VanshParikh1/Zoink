const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Renders an ISO date string (e.g. "2026-08-28" or a full timestamp) as a
// human-readable long date like "August 28 2026". Dates coming from the API are
// calendar dates with no meaningful time-of-day, so they're read in UTC to
// avoid a local-timezone shift moving them onto the previous/next day.
export function formatLongDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${date.getUTCFullYear()}`
}
