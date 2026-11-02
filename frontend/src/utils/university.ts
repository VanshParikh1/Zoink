import { universityForEmail, UNIVERSITY_SHORT_LABELS } from '@zoink/shared'

/** "UofT" for a @mail.utoronto.ca (or @utoronto.ca) address; null when the domain isn't a known school. */
export function universityFromEmail(email: string | null | undefined): string | null {
  const match = universityForEmail(email)
  return match ? UNIVERSITY_SHORT_LABELS[match] : null
}
