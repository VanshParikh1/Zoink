import { BrowseListingsResult, ListingBrowseItem, ListingImage, User } from '../types'
import type { BrowseListingsParams, CreateListingPayload, UpdateListingPayload } from './listingsApi'
import { demoProfile, publicProfiles, toDemoUser } from './mockProfiles'

const demoOwner: User = toDemoUser(demoProfile)

function ownerOf(userId: string): User {
  return toDemoUser(publicProfiles[userId] ?? demoProfile)
}

// Stable "now" so every screenshot run is identical.
const NOW = new Date('2026-06-01T12:00:00.000Z')
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

// Unsplash — objects only, no people. A few of these URLs are reused within a
// category; that is fine for demo data. The four marked (proven) are already
// used elsewhere in the repo; spot-check the rest once in the running app.
const IMG = {
  cameraBody: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80', // (proven)
  cameraHeld: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1200&q=80',
  cameraLens: 'https://images.unsplash.com/photo-1495707902641-75cac588d2e9?auto=format&fit=crop&w=1200&q=80',
  cameraFilm: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80',
  speaker: 'https://images.unsplash.com/photo-1589003077984-894e133dabab?auto=format&fit=crop&w=1200&q=80', // (proven)
  headphones: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1200&q=80',
  mixer: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
  headphones2: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80',
  drill: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80', // (proven)
  toolsPegboard: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=1200&q=80',
  wrenches: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=80',
  workbench: 'https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?auto=format&fit=crop&w=1200&q=80',
} as const

function img(id: string, url: string, order = 0): ListingImage {
  return { id, url, order }
}

type ListingSeed = {
  id: string
  title: string
  description: string
  category: string
  dailyPrice: number
  itemValue: number
  depositAmount: number
  avgRating: number | null
  reviewCount: number
  ownerId: string
  city?: string
  address: string
  latitude: number
  longitude: number
  distanceKm: number
  isAvailable?: boolean
  images: ListingImage[]
  createdDaysAgo: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo listings — three concentrated categories that match the marketing
// materials (Cameras / Audio-Video / Tools). itemValue ≈ 15–40× the daily
// rate and depositAmount ≈ 1–2× so the deposit-held and item-value UI reads
// as plausible across the price range. Ratings are deliberately spread: mostly
// 4.2–4.9, two below 4.0, two brand-new (null) listings.
// ─────────────────────────────────────────────────────────────────────────────

const LISTING_SEEDS: ListingSeed[] = [
  // ── Audio/Video ──
  {
    id: 'demo-listing-1',
    title: 'Sony Bluetooth Party Speaker',
    description: 'Loud portable speaker for parties, picnics, and study-room events. Comes fully charged with the USB-C cable.',
    category: 'Audio/Video',
    dailyPrice: 12,
    itemValue: 220,
    depositAmount: 20,
    avgRating: 4.6,
    reviewCount: 8,
    ownerId: 'demo-user-2',
    address: 'Downtown campus',
    latitude: 43.6532,
    longitude: -79.3832,
    distanceKm: 1.4,
    images: [img('demo-image-l1-a', IMG.speaker)],
    createdDaysAgo: 40,
  },
  {
    id: 'demo-listing-8',
    title: 'JBL PartyBox 110 Speaker',
    description: 'Big room-filling sound with a light show. Great for house parties and club events. Wheels not included, but it has a solid handle.',
    category: 'Audio/Video',
    dailyPrice: 25,
    itemValue: 480,
    depositAmount: 40,
    avgRating: 4.7,
    reviewCount: 21,
    ownerId: 'demo-user-5',
    address: 'Church-Wellesley',
    latitude: 43.6655,
    longitude: -79.3806,
    distanceKm: 2.0,
    images: [img('demo-image-l8-a', IMG.speaker)],
    createdDaysAgo: 120,
  },
  {
    id: 'demo-listing-9',
    title: 'Pioneer DDJ-400 DJ Controller',
    description: 'Entry-level DJ controller that maps 1:1 to Rekordbox. Includes USB cable. Perfect for your first set or practising at home.',
    category: 'Audio/Video',
    dailyPrice: 32,
    itemValue: 700,
    depositAmount: 55,
    avgRating: 4.5,
    reviewCount: 11,
    ownerId: 'demo-user-5',
    address: 'Church-Wellesley',
    latitude: 43.6655,
    longitude: -79.3806,
    distanceKm: 2.0,
    images: [img('demo-image-l9-a', IMG.mixer)],
    createdDaysAgo: 95,
  },
  {
    id: 'demo-listing-10',
    title: 'Sony WH-1000XM4 Headphones (pair)',
    description: 'Two sets of noise-cancelling over-ears — handy for a shared study trip or a flight. Cases and cables included.',
    category: 'Audio/Video',
    dailyPrice: 15,
    itemValue: 420,
    depositAmount: 25,
    avgRating: 4.4,
    reviewCount: 13,
    ownerId: 'demo-user-3',
    address: 'The Annex',
    latitude: 43.6702,
    longitude: -79.4058,
    distanceKm: 3.4,
    images: [img('demo-image-l10-a', IMG.headphones), img('demo-image-l10-b', IMG.headphones2, 1)],
    createdDaysAgo: 60,
  },
  {
    id: 'demo-listing-11',
    title: 'Epson 1080p Projector + Screen',
    description: 'Movie-night setup: 1080p projector, 100" pull-up screen, HDMI cable. A bit dim in daylight, best after dark.',
    category: 'Audio/Video',
    dailyPrice: 22,
    itemValue: 600,
    depositAmount: 35,
    avgRating: 3.6,
    reviewCount: 7,
    ownerId: 'demo-user-8',
    city: 'Hamilton',
    address: 'Westdale',
    latitude: 43.2609,
    longitude: -79.9192,
    distanceKm: 58,
    images: [img('demo-image-l11-a', IMG.mixer)],
    createdDaysAgo: 30,
  },
  {
    id: 'demo-listing-12',
    title: 'Shure SM58 Mic + Stand (pair)',
    description: 'Two SM58s, two boom stands, two XLR cables. The standard for open mics, karaoke, and small gigs.',
    category: 'Audio/Video',
    dailyPrice: 14,
    itemValue: 300,
    depositAmount: 22,
    avgRating: 4.8,
    reviewCount: 16,
    ownerId: 'demo-user-1',
    address: 'Kensington Market',
    latitude: 43.6547,
    longitude: -79.4005,
    distanceKm: 1.1,
    images: [img('demo-image-l12-a', IMG.mixer)],
    createdDaysAgo: 75,
  },

  // ── Cameras ──
  {
    id: 'demo-listing-2',
    title: 'Canon EOS Rebel DSLR Kit',
    description: 'Beginner-friendly DSLR with 18-55mm lens, charger, 64GB SD card, and a padded bag. Great for class projects and first shoots.',
    category: 'Cameras',
    dailyPrice: 24,
    itemValue: 650,
    depositAmount: 40,
    avgRating: 4.8,
    reviewCount: 26,
    ownerId: 'demo-user-4',
    address: 'UofT — St. George',
    latitude: 43.6629,
    longitude: -79.3957,
    distanceKm: 2.2,
    images: [img('demo-image-l2-a', IMG.cameraBody), img('demo-image-l2-b', IMG.cameraHeld, 1)],
    createdDaysAgo: 210,
  },
  {
    id: 'demo-listing-3',
    title: 'Sony a6400 Mirrorless + 16-50mm',
    description: 'Compact mirrorless that shoots great 4K video. Flip screen for vlogging. Two batteries, charger, and a 128GB card included.',
    category: 'Cameras',
    dailyPrice: 38,
    itemValue: 1100,
    depositAmount: 60,
    avgRating: 4.9,
    reviewCount: 14,
    ownerId: 'demo-user-1',
    address: 'Kensington Market',
    latitude: 43.6547,
    longitude: -79.4005,
    distanceKm: 1.1,
    images: [img('demo-image-l3-a', IMG.cameraBody)],
    createdDaysAgo: 100,
  },
  {
    id: 'demo-listing-4',
    title: 'Fujifilm X-T30 Street Kit',
    description: 'Retro-styled body with the 27mm pancake lens. Film simulations are ready to go. Ideal for a weekend photo walk.',
    category: 'Cameras',
    dailyPrice: 34,
    itemValue: 950,
    depositAmount: 55,
    avgRating: 4.6,
    reviewCount: 9,
    ownerId: 'demo-user-10',
    address: 'Oshawa — Ontario Tech',
    latitude: 43.9456,
    longitude: -78.8963,
    distanceKm: 62,
    images: [img('demo-image-l4-a', IMG.cameraFilm)],
    createdDaysAgo: 20,
  },
  {
    id: 'demo-listing-5',
    title: 'GoPro HERO12 Action Bundle',
    description: 'Action cam with chest mount, head strap, floaty grip, and two batteries. Lens glass has light micro-scratches (see photos) — does not affect footage.',
    category: 'Cameras',
    dailyPrice: 20,
    itemValue: 430,
    depositAmount: 30,
    avgRating: 3.9,
    reviewCount: 12,
    ownerId: 'demo-user-3',
    address: 'The Annex',
    latitude: 43.6702,
    longitude: -79.4058,
    distanceKm: 3.4,
    images: [img('demo-image-l5-a', IMG.cameraHeld)],
    createdDaysAgo: 55,
  },
  {
    id: 'demo-listing-6',
    title: 'Canon Lens Pair — 50mm f/1.8 + 24-70mm',
    description: 'Two EF lenses for full-frame or crop Canon bodies. The nifty fifty for portraits and the 24-70 as a walk-around zoom.',
    category: 'Cameras',
    dailyPrice: 28,
    itemValue: 900,
    depositAmount: 45,
    avgRating: 4.7,
    reviewCount: 18,
    ownerId: 'demo-user-4',
    address: 'UofT — St. George',
    latitude: 43.6629,
    longitude: -79.3957,
    distanceKm: 2.2,
    images: [img('demo-image-l6-a', IMG.cameraLens)],
    createdDaysAgo: 150,
  },
  {
    id: 'demo-listing-7',
    title: 'DJI Mini 3 Drone',
    description: 'Sub-250g drone — no registration needed. 4K camera, three batteries, ND filters, and the controller. Just added, first rental gets a discount.',
    category: 'Cameras',
    dailyPrice: 45,
    itemValue: 950,
    depositAmount: 75,
    avgRating: null,
    reviewCount: 0,
    ownerId: 'demo-user-9',
    city: 'Waterloo',
    address: 'UW — Engineering',
    latitude: 43.4723,
    longitude: -80.5449,
    distanceKm: 94,
    images: [img('demo-image-l7-a', IMG.cameraHeld)],
    createdDaysAgo: 4,
  },

  // ── Tools ──
  {
    id: 'demo-listing-13',
    title: 'Makita 18V Cordless Drill Set',
    description: 'Drill + impact driver, two batteries, charger, and a bit set in a hard case. Handles furniture builds and dorm projects easily.',
    category: 'Tools',
    dailyPrice: 12,
    itemValue: 260,
    depositAmount: 20,
    avgRating: 4.9,
    reviewCount: 24,
    ownerId: 'demo-user-6',
    city: 'Waterloo',
    address: 'Uptown Waterloo',
    latitude: 43.4643,
    longitude: -80.5204,
    distanceKm: 92,
    images: [img('demo-image-l13-a', IMG.drill)],
    createdDaysAgo: 170,
  },
  {
    id: 'demo-listing-14',
    title: 'DeWalt Circular Saw',
    description: '7-1/4" corded circular saw with a fresh blade. Good for plywood, framing lumber, and shelf builds. Safety glasses included.',
    category: 'Tools',
    dailyPrice: 16,
    itemValue: 300,
    depositAmount: 28,
    avgRating: 4.7,
    reviewCount: 15,
    ownerId: 'demo-user-9',
    city: 'Waterloo',
    address: 'UW — Engineering',
    latitude: 43.4723,
    longitude: -80.5449,
    distanceKm: 94,
    images: [img('demo-image-l14-a', IMG.toolsPegboard)],
    createdDaysAgo: 130,
  },
  {
    id: 'demo-listing-15',
    title: 'Bosch Orbital Sander',
    description: 'Random-orbit sander with a pack of assorted-grit discs and a dust bag. Makes refinishing a thrifted desk a one-afternoon job.',
    category: 'Tools',
    dailyPrice: 9,
    itemValue: 160,
    depositAmount: 15,
    avgRating: 4.6,
    reviewCount: 10,
    ownerId: 'demo-user-1',
    address: 'Kensington Market',
    latitude: 43.6547,
    longitude: -79.4005,
    distanceKm: 1.1,
    images: [img('demo-image-l15-a', IMG.workbench)],
    createdDaysAgo: 80,
  },
  {
    id: 'demo-listing-16',
    title: 'Socket & Wrench Set (215 pc)',
    description: 'Full metric + SAE socket set with ratchets, extensions, and combination wrenches in a blow-mould case. Everything is accounted for.',
    category: 'Tools',
    dailyPrice: 10,
    itemValue: 220,
    depositAmount: 16,
    avgRating: 4.2,
    reviewCount: 6,
    ownerId: 'demo-user-6',
    city: 'Waterloo',
    address: 'Uptown Waterloo',
    latitude: 43.4643,
    longitude: -80.5204,
    distanceKm: 92,
    images: [img('demo-image-l16-a', IMG.wrenches)],
    createdDaysAgo: 45,
  },
  {
    id: 'demo-listing-17',
    title: 'Heat Gun + Soldering Kit',
    description: 'Variable-temp heat gun plus a soldering iron, stand, solder, and helping hands. For shrink tubing, small electronics repair, and craft work.',
    category: 'Tools',
    dailyPrice: 8,
    itemValue: 140,
    depositAmount: 14,
    avgRating: 4.8,
    reviewCount: 12,
    ownerId: 'demo-user-9',
    city: 'Waterloo',
    address: 'UW — Engineering',
    latitude: 43.4723,
    longitude: -80.5449,
    distanceKm: 94,
    images: [img('demo-image-l17-a', IMG.workbench)],
    createdDaysAgo: 65,
  },
  {
    id: 'demo-listing-18',
    title: 'Bike Repair Stand + Tool Kit',
    description: 'Clamp-style repair stand plus a roll of bike-specific tools — hex keys, chain tool, tyre levers, cable cutters. Tune-ups without the floor gymnastics.',
    category: 'Tools',
    dailyPrice: 14,
    itemValue: 340,
    depositAmount: 24,
    avgRating: null,
    reviewCount: 0,
    ownerId: 'demo-user-7',
    address: 'York U — Keele',
    latitude: 43.7735,
    longitude: -79.5019,
    distanceKm: 18,
    images: [img('demo-image-l18-a', IMG.toolsPegboard)],
    createdDaysAgo: 6,
  },
]

function toBrowseItem(seed: ListingSeed): ListingBrowseItem {
  const created = daysAgo(seed.createdDaysAgo)
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    category: seed.category,
    dailyPrice: String(seed.dailyPrice),
    itemValue: String(seed.itemValue),
    depositAmount: String(seed.depositAmount),
    isAvailable: seed.isAvailable ?? true,
    avgRating: seed.avgRating,
    reviewCount: seed.reviewCount,
    latitude: seed.latitude,
    longitude: seed.longitude,
    city: seed.city ?? 'Toronto',
    address: seed.address,
    ownerId: seed.ownerId,
    owner: ownerOf(seed.ownerId),
    images: seed.images,
    createdAt: created,
    updatedAt: created,
    distanceKm: seed.distanceKm,
  }
}

export const DEMO_LISTINGS: ListingBrowseItem[] = LISTING_SEEDS.map(toBrowseItem)

let listings: ListingBrowseItem[] = [...DEMO_LISTINGS]

export async function mockGetNearbyListings() {
  return listings
    .filter((listing) => listing.isAvailable)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
}

export async function mockBrowseListings({
  query,
  category,
  minPrice,
  maxPrice,
}: BrowseListingsParams): Promise<BrowseListingsResult> {
  const normalizedQuery = query?.trim().toLowerCase()
  const normalizedCategory = category?.trim().toLowerCase()

  const items = listings
    .filter((listing) => listing.isAvailable)
    .filter((listing) => {
      if (normalizedQuery) {
        const haystack = `${listing.title} ${listing.description} ${listing.category} ${listing.city}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }

      if (normalizedCategory && listing.category.toLowerCase() !== normalizedCategory) {
        return false
      }

      if (minPrice != null && Number(listing.dailyPrice) < minPrice) {
        return false
      }

      if (maxPrice != null && Number(listing.dailyPrice) > maxPrice) {
        return false
      }

      return true
    })
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))

  return {
    items,
    total: items.length,
    hasMore: false,
  }
}

export async function mockGetListingCategories() {
  return [...new Set(listings.map((listing) => listing.category))].sort((a, b) => a.localeCompare(b))
}

export async function mockCreateListing(data: CreateListingPayload) {
  const listing: ListingBrowseItem = {
    id: `demo-listing-${Date.now()}`,
    ...data,
    address: data.address ?? null,
    dailyPrice: String(data.dailyPrice),
    itemValue: '0',
    depositAmount: data.depositAmount != null ? String(data.depositAmount) : '0',
    isAvailable: true,
    avgRating: null,
    reviewCount: 0,
    ownerId: demoOwner.id,
    owner: demoOwner,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: null,
  }

  listings = [listing, ...listings]
  return listing
}

export async function mockGetListing(id: string) {
  const listing = listings.find((item) => item.id === id)
  if (!listing) throw new Error('Listing not found.')
  return listing
}

export async function mockGetMyListings() {
  return listings.filter((listing) => listing.ownerId === demoOwner.id)
}

export async function mockUpdateListing(id: string, data: UpdateListingPayload) {
  const existing = await mockGetListing(id)
  const updated = {
    ...existing,
    ...data,
    dailyPrice: data.dailyPrice != null ? String(data.dailyPrice) : existing.dailyPrice,
    itemValue: data.itemValue != null ? String(data.itemValue) : existing.itemValue,
    depositAmount: data.depositAmount != null ? String(data.depositAmount) : existing.depositAmount,
  }

  listings = listings.map((listing) => (listing.id === id ? updated : listing))
  return updated
}

export async function mockSetAvailability(id: string, isAvailable: boolean) {
  listings = listings.map((listing) =>
    listing.id === id ? { ...listing, isAvailable } : listing
  )

  return { id, isAvailable }
}

export async function mockDeleteListing(id: string) {
  listings = listings.filter((listing) => listing.id !== id)
}

export async function mockUploadListingImage(listingId: string, uri: string) {
  const image: ListingImage = {
    id: `demo-image-${Date.now()}`,
    url: uri,
    order: 0,
  }

  listings = listings.map((listing) =>
    listing.id === listingId ? { ...listing, images: [...listing.images, image] } : listing
  )

  return image
}

export async function mockDeleteListingImage(listingId: string, imageId: string) {
  listings = listings.map((listing) =>
    listing.id === listingId
      ? { ...listing, images: listing.images.filter((image) => image.id !== imageId) }
      : listing
  )
}
