import { University, UNIVERSITY_DOMAINS, UNIVERSITY_SHORT_LABELS } from '@zoink/shared'

/** "UofT" for a @mail.utoronto.ca address; null when the domain isn't a known school. */
export function universityFromEmail(email: string | null | undefined): string | null {
  const domain = email?.split('@')[1]?.toLowerCase()
  if (!domain) return null
  const match = (Object.keys(UNIVERSITY_DOMAINS) as University[]).find((key) => UNIVERSITY_DOMAINS[key] === domain)
  return match ? UNIVERSITY_SHORT_LABELS[match] : null
}
