// One place for reading and showing dates. Storage is UTC; people read
// Toronto time. Two kinds of values reach the app:
//
//  - Calendar dates: a rental's requested start/end day, sent by the app as
//    midnight UTC of that day ("2026-10-20T00:00:00.000Z"). They name a day,
//    not a moment, so they are read in UTC: read in Toronto they would show
//    the previous day.
//  - Instants: everything else (messages, payments, taps), plus a rental's
//    startDate/endDate once the handoff overwrites them with the real pickup
//    and return times. These are shown in Toronto time.

export const APP_TIME_ZONE = 'America/Toronto'

export type DateInput = string | number | Date

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** True for a value at exactly midnight UTC: a rental's calendar day as the app
 *  sends it. A real pickup or return time is never exactly midnight to the
 *  millisecond. */
export function isCalendarDateValue(value: DateInput | null | undefined): boolean {
  const date = toDate(value)
  return (
    date !== null &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function dayKeyIn(date: Date, timeZone: string): string {
  if (timeZone === 'UTC') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  }
  try {
    let formatter = partsFormatters.get(timeZone)
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      partsFormatters.set(timeZone, formatter)
    }
    const parts = formatter.formatToParts(date)
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    // A JS engine without time-zone support: the device's own day is the best
    // available answer (and is Toronto's for nearly every user).
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}

/** The day (YYYY-MM-DD) an instant falls on in Toronto. Defaults to now. */
export function torontoDayKey(value: DateInput = Date.now()): string | null {
  const date = toDate(value)
  return date ? dayKeyIn(date, APP_TIME_ZONE) : null
}

/** The calendar day (YYYY-MM-DD) a rental start/end value names: its UTC day
 *  for a calendar date, its Toronto day for a real handoff time. */
export function rentalDayKey(value: DateInput | null | undefined): string | null {
  const date = toDate(value)
  if (!date) return null
  return dayKeyIn(date, isCalendarDateValue(date) ? 'UTC' : APP_TIME_ZONE)
}

/** Whole days from one YYYY-MM-DD key to another (negative if `to` is earlier). */
export function daysBetween(fromKey: string, toKey: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(toKey) - parse(fromKey)) / DAY_MS)
}

/** Inclusive number of rental days between two rental start/end values, by
 *  calendar day (Oct 20 to Oct 22 is 3). */
export function rentalDayCount(start: DateInput, end: DateInput): number {
  const from = rentalDayKey(start)
  const to = rentalDayKey(end)
  return from && to ? daysBetween(from, to) + 1 : 0
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type DateStyle = 'short' | 'weekday' | 'long'

const STYLE_OPTIONS: Record<Exclude<DateStyle, 'long'>, Intl.DateTimeFormatOptions> = {
  short: { month: 'short', day: 'numeric' },
  weekday: { weekday: 'short', month: 'short', day: 'numeric' },
}

function formatDay(date: Date, timeZone: string, style: DateStyle, locale?: string) {
  if (style === 'long') {
    // "October 20 2026", the format the app has always used for long dates.
    const [y, m, d] = dayKeyIn(date, timeZone).split('-').map(Number)
    return `${MONTHS[m - 1]} ${d} ${y}`
  }
  return date.toLocaleDateString(locale, { ...STYLE_OPTIONS[style], timeZone })
}

/** A rental's start or end date: "Oct 20" (short), "Tue, Oct 20" (weekday) or
 *  "October 20 2026" (long). Calendar dates never shift a day, whatever the
 *  device's time zone; handoff times show their Toronto day. */
export function formatRentalDate(value: DateInput | null | undefined, style: DateStyle = 'short', locale?: string): string {
  const date = toDate(value)
  if (!date) return ''
  return formatDay(date, isCalendarDateValue(date) ? 'UTC' : APP_TIME_ZONE, style, locale)
}

/** The Toronto day of an instant (a payment, an acceptance, a block). */
export function formatDayOf(value: DateInput | null | undefined, style: DateStyle = 'short', locale?: string): string {
  const date = toDate(value)
  return date ? formatDay(date, APP_TIME_ZONE, style, locale) : ''
}

/** Toronto time of day, e.g. "6:05 PM". */
export function formatTimeOfDay(value: DateInput | null | undefined, locale?: string): string {
  const date = toDate(value)
  return date ? date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: APP_TIME_ZONE }) : ''
}

/** Toronto date and time, e.g. "Oct 20, 6:05 PM". */
export function formatDateTime(value: DateInput | null | undefined, locale?: string): string {
  const date = toDate(value)
  return date
    ? date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: APP_TIME_ZONE })
    : ''
}

/** True when the instant falls on today's date in Toronto. */
export function isTodayInToronto(value: DateInput | null | undefined, now: DateInput = Date.now()): boolean {
  const key = torontoDayKey(value ?? '')
  return key !== null && key === torontoDayKey(now)
}
