import { Listing, ListingImage, User } from '../types'
import type { CreateListingPayload, UpdateListingPayload } from './listingsApi'
import { demoProfile, publicProfiles, toDemoUser } from './mockProfiles'

const demoOwner: User = toDemoUser(demoProfile)
const otherOwner: User = toDemoUser(publicProfiles['demo-user-2'])
const thirdOwner: User = toDemoUser(publicProfiles['demo-user-3'])

let listings: Listing[] = [
  {
    id: 'demo-listing-1',
    title: 'Sony Bluetooth Speaker',
    description: 'Loud portable speaker for parties, picnics, and study room events. Comes fully charged.',
    category: 'Audio/Video',
    dailyPrice: 12,
    isAvailable: true,
    latitude: 43.6532,
    longitude: -79.3832,
    city: 'Toronto',
    address: 'Downtown campus',
    ownerId: otherOwner.id,
    owner: otherOwner,
    images: [
      {
        id: 'demo-image-speaker-1',
        url: 'https://images.unsplash.com/photo-1589003077984-894e133dabab?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    distanceKm: 1.4,
  },
  {
    id: 'demo-listing-2',
    title: 'Canon DSLR Camera Kit',
    description: 'Beginner-friendly DSLR with lens, charger, SD card, and padded bag. Great for class projects.',
    category: 'Cameras',
    dailyPrice: 24,
    isAvailable: true,
    latitude: 43.6629,
    longitude: -79.3957,
    city: 'Toronto',
    address: 'UofT area',
    ownerId: otherOwner.id,
    owner: otherOwner,
    images: [
      {
        id: 'demo-image-camera-1',
        url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    distanceKm: 2.2,
  },
  {
    id: 'demo-listing-3',
    title: 'Cordless Drill Set',
    description: 'Compact drill with bits. Perfect for furniture assembly and small dorm projects.',
    category: 'Tools',
    dailyPrice: 9,
    isAvailable: true,
    latitude: 43.657,
    longitude: -79.38,
    city: 'Toronto',
    address: 'TMU area',
    ownerId: demoOwner.id,
    owner: demoOwner,
    images: [
      {
        id: 'demo-image-drill-1',
        url: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    distanceKm: 0.8,
  },
  {
    id: 'demo-listing-4',
    title: 'Camping Chair + Lantern Bundle',
    description: 'Foldable chair and rechargeable lantern combo for beach nights, campus events, or quick weekend trips.',
    category: 'Outdoors',
    dailyPrice: 11,
    isAvailable: true,
    latitude: 43.6487,
    longitude: -79.3861,
    city: 'Toronto',
    address: 'Harbourfront',
    ownerId: thirdOwner.id,
    owner: thirdOwner,
    images: [
      {
        id: 'demo-image-camping-1',
        url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    distanceKm: 3.1,
  },
]

export async function mockGetNearbyListings() {
  return listings
    .filter((listing) => listing.isAvailable)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
}

export async function mockCreateListing(data: CreateListingPayload) {
  const listing: Listing = {
    id: `demo-listing-${Date.now()}`,
    ...data,
    isAvailable: true,
    ownerId: demoOwner.id,
    owner: demoOwner,
    images: [],
    createdAt: new Date().toISOString(),
    distanceKm: 0,
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
  const updated = { ...existing, ...data }

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
