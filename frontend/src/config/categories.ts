// The listing categories the app offers. CreateListingScreen keeps its own
// copy of this list for now; keep the two in sync.
export const LISTING_CATEGORIES = [
  'Electronics',
  'Tools',
  'Sports',
  'Outdoors',
  'Audio/Video',
  'Cameras',
  'Clothing',
  'Books',
  'Other',
] as const

const ABBREVIATIONS: Record<string, string> = {
  Electronics: 'ELC',
  Tools: 'TLS',
  Sports: 'SPT',
  Outdoors: 'OUT',
  'Audio/Video': 'A/V',
  Cameras: 'CAM',
  Clothing: 'CLO',
  Books: 'BKS',
  Other: 'OTH',
}

/** Three-letter label for a listing with no photo. */
export function categoryAbbreviation(category: string | null | undefined): string {
  if (!category) return '—'
  return ABBREVIATIONS[category] ?? category.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}
