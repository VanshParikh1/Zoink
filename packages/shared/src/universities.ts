import type { University } from '../generated/prisma-models'

// Single source of truth for the student-email allowlist used at
// registration. Keys must stay in sync with the `University` enum in
// backend/prisma/schema.prisma — see the comment above that enum.
export const UNIVERSITY_DOMAINS: Record<University, string> = {
  UOFT: 'mail.utoronto.ca',
  TMU: 'torontomu.ca',
  LAURIER: 'mylaurier.ca',
  YORK: 'my.yorku.ca',
  ONTARIO_TECH: 'ontariotechu.net',
  MCMASTER: 'mcmaster.ca',
  WATERLOO: 'uwaterloo.ca',
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
