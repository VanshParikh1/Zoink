import { University, UNIVERSITY_DOMAINS } from '@zoink/shared'

// Every form's client-side checks, in one place and unit-tested
// (formValidation.test.ts). The server checks again and is the one trusted;
// these show the problem under the field before a round trip.
//
// Messages are short on purpose: each shows in a line reserved under its
// field (TextField's `validated`), so one appearing doesn't move the form.

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean)
}

/** backend/src/schemas/auth.schema.ts's rule (formValidation.test.ts holds the two together). */
export const CANADIAN_PHONE_REGEX = /^(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/

/** Sign-up allows 8 to 128 characters (backend auth.schema.ts). */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

function blank(value: string | null | undefined) {
  return !value || !value.trim()
}

export function validateSignIn(form: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {}
  if (blank(form.email)) errors.email = 'Enter your student email.'
  if (!form.password) errors.password = 'Enter your password.'
  return errors
}

type RegistrationField = 'email' | 'university' | 'firstName' | 'lastName' | 'phone' | 'password'

export function validateRegistration(form: {
  email: string
  university: University | null
  firstName: string
  lastName: string
  phone: string
  password: string
}): FieldErrors<RegistrationField> {
  const errors: FieldErrors<RegistrationField> = {}
  const email = form.email.trim().toLowerCase()
  if (!email) errors.email = 'Enter your student email.'
  else if (form.university && !email.endsWith(`@${UNIVERSITY_DOMAINS[form.university]}`)) {
    errors.email = `Use your @${UNIVERSITY_DOMAINS[form.university]} address.`
  }
  if (!form.university) errors.university = 'Choose your university.'
  if (blank(form.firstName)) errors.firstName = 'Enter your first name.'
  if (blank(form.lastName)) errors.lastName = 'Enter your last name.'
  if (blank(form.phone)) errors.phone = 'Enter your phone number.'
  else if (!CANADIAN_PHONE_REGEX.test(form.phone.trim())) errors.phone = 'Enter a 10-digit phone number.'
  if (!form.password) errors.password = 'Choose a password.'
  else if (form.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`
  else if (form.password.length > PASSWORD_MAX) errors.password = `Use ${PASSWORD_MAX} characters or fewer.`
  return errors
}

export type ListingField = 'photos' | 'title' | 'category' | 'description' | 'dailyPrice' | 'deposit' | 'itemValue' | 'city'

/** Creating (with `minPhotos`) or editing a listing. Money fields are typed text. */
export function validateListing(
  form: { title: string; category: string; description: string; dailyPrice: string; deposit: string; itemValue: string; city: string },
  { photoCount, minPhotos }: { photoCount?: number; minPhotos?: number } = {}
): FieldErrors<ListingField> {
  const errors: FieldErrors<ListingField> = {}
  if (minPhotos !== undefined && (photoCount ?? 0) < minPhotos) {
    errors.photos = minPhotos === 1 ? 'Add at least one photo of your item.' : `Add at least ${minPhotos} photos of your item.`
  }
  if (blank(form.title)) errors.title = 'Add a name for your item.'
  if (!form.category) errors.category = 'Pick a category.'
  if (blank(form.description)) errors.description = 'Write a short description.'

  const price = Number.parseFloat(form.dailyPrice)
  if (blank(form.dailyPrice)) errors.dailyPrice = 'Add a price.'
  else if (!Number.isFinite(price) || price <= 0) errors.dailyPrice = 'Must be more than $0.'

  const hasDeposit = !blank(form.deposit)
  const hasValue = !blank(form.itemValue)
  const deposit = Number.parseFloat(form.deposit)
  const value = Number.parseFloat(form.itemValue)
  if (hasDeposit && (!Number.isFinite(deposit) || deposit < 0)) errors.deposit = 'Must be $0 or more.'
  if (hasValue && (!Number.isFinite(value) || value < 0)) errors.itemValue = 'Must be $0 or more.'
  else if (hasDeposit && !hasValue) errors.itemValue = 'Needed with a deposit.'
  else if (hasDeposit && hasValue && !errors.deposit && deposit > value) errors.deposit = "Can't be more than the item value."

  if (blank(form.city)) errors.city = 'Add a city so renters can find it.'
  return errors
}

export function validateProfile(form: { firstName: string; lastName: string; phone: string }): FieldErrors<'firstName' | 'lastName' | 'phone'> {
  const errors: FieldErrors<'firstName' | 'lastName' | 'phone'> = {}
  if (blank(form.firstName)) errors.firstName = 'Enter your first name.'
  if (blank(form.lastName)) errors.lastName = 'Enter your last name.'
  // Optional on the profile, but if it's there it has to be a real number.
  if (!blank(form.phone) && !CANADIAN_PHONE_REGEX.test(form.phone.trim())) errors.phone = 'Enter a 10-digit phone number.'
  return errors
}

/** Reporting a problem with a booking: a reason, and a description of at least `minLength`. */
export function validateDispute(form: { reason: string | null; description: string }, minLength: number): FieldErrors<'reason' | 'description'> {
  const errors: FieldErrors<'reason' | 'description'> = {}
  if (!form.reason) errors.reason = 'Choose what went wrong.'
  if (form.description.trim().length < minLength) errors.description = `Add at least ${minLength} characters.`
  return errors
}

/** Reporting a user, listing or message: a reason; details optional but not a stub. */
export function validateReport(form: { reason: string | null; description: string }, minLength: number): FieldErrors<'reason' | 'description'> {
  const errors: FieldErrors<'reason' | 'description'> = {}
  if (!form.reason) errors.reason = 'Choose what went wrong.'
  const length = form.description.trim().length
  if (length > 0 && length < minLength) errors.description = `Add at least ${minLength} characters, or leave it blank.`
  return errors
}

export function validateReview(form: { scores: (number | null | undefined)[]; itemRating?: number | null; ratesItem: boolean }): FieldErrors<'scores' | 'itemRating'> {
  const errors: FieldErrors<'scores' | 'itemRating'> = {}
  if (form.scores.some((score) => !score)) errors.scores = 'Rate all three to continue.'
  if (form.ratesItem && !form.itemRating) errors.itemRating = 'Rate the item to continue.'
  return errors
}

/** An admin resolving a dispute; `amount` only for an outcome that moves money, capped at `capDollars`. */
export function validateResolution(form: {
  resolution: string | null
  notes: string
  minNotes: number
  amount?: { input: string; capDollars: number }
}): FieldErrors<'resolution' | 'notes' | 'amount'> {
  const errors: FieldErrors<'resolution' | 'notes' | 'amount'> = {}
  if (!form.resolution) errors.resolution = 'Choose an outcome.'
  if (form.notes.trim().length < form.minNotes) errors.notes = 'Add a short note explaining this.'
  if (form.amount) {
    const dollars = Number(form.amount.input)
    const cents = Math.round(dollars * 100)
    if (blank(form.amount.input) || !Number.isFinite(dollars) || cents <= 0) errors.amount = 'Enter an amount over $0.'
    else if (cents > Math.round(form.amount.capDollars * 100)) errors.amount = `Can't be more than $${form.amount.capDollars.toFixed(2)}.`
  }
  return errors
}
