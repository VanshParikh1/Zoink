import type { University } from '../generated/prisma-models'

// Single source of truth for the student-email allowlist used at
// registration (backend RegisterSchema and the app's inline check). Keys must
// stay in sync with the `University` enum in backend/prisma/schema.prisma —
// see the comment above that enum. The first domain of each school is its
// student address, shown in hints; the rest are also accepted. A domain only
// matches exactly (`@utoronto.ca` does not admit `@x.utoronto.ca`).
export const UNIVERSITY_EMAIL_DOMAINS: Record<University, readonly string[]> = {
  UOFT: ['mail.utoronto.ca', 'utoronto.ca'],
  // ryerson.ca: TMU's pre-2022 address, still in use by some students.
  TMU: ['torontomu.ca', 'ryerson.ca'],
  LAURIER: ['mylaurier.ca'],
  YORK: ['my.yorku.ca', 'yorku.ca'],
  ONTARIO_TECH: ['ontariotechu.net', 'ontariotechu.ca'],
  MCMASTER: ['mcmaster.ca'],
  WATERLOO: ['uwaterloo.ca'],
}

/** Each school's student email domain, for placeholders and hints. */
export const UNIVERSITY_DOMAINS = Object.fromEntries(
  Object.entries(UNIVERSITY_EMAIL_DOMAINS).map(([key, domains]) => [key, domains[0]]),
) as Record<University, string>

/** True when `email` is at one of `university`'s domains. */
export function isUniversityEmail(university: University, email: string) {
  const domain = email.trim().toLowerCase().split('@')[1]
  return Boolean(domain) && UNIVERSITY_EMAIL_DOMAINS[university].includes(domain)
}

/** The school whose domain `email` is at, or null. */
export function universityForEmail(email: string | null | undefined): University | null {
  const domain = email?.trim().toLowerCase().split('@')[1]
  if (!domain) return null
  const keys = Object.keys(UNIVERSITY_EMAIL_DOMAINS) as University[]
  return keys.find((key) => UNIVERSITY_EMAIL_DOMAINS[key].includes(domain)) ?? null
}

/** "@mail.utoronto.ca or @utoronto.ca", for error messages. */
export function universityDomainsText(university: University) {
  const domains = UNIVERSITY_EMAIL_DOMAINS[university].map((domain) => `@${domain}`)
  return domains.length > 1 ? `${domains.slice(0, -1).join(', ')} or ${domains[domains.length - 1]}` : domains[0]
}

export const UNIVERSITY_LABELS: Record<University, string> = {
  UOFT: 'University of Toronto',
  TMU: 'Toronto Metropolitan University',
  LAURIER: 'Wilfrid Laurier University',
  YORK: 'York University',
  ONTARIO_TECH: 'Ontario Tech University',
  MCMASTER: 'McMaster University',
  WATERLOO: 'University of Waterloo',
}

// Short display names for compact UI (e.g. the sign-up universities card).
export const UNIVERSITY_SHORT_LABELS: Record<University, string> = {
  UOFT: 'UofT',
  TMU: 'TMU',
  LAURIER: 'Laurier',
  YORK: 'York',
  ONTARIO_TECH: 'Ontario Tech',
  MCMASTER: 'McMaster',
  WATERLOO: 'Waterloo',
}
