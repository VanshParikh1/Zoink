import api from './api'
import { Listing, ListingImage } from '../types'
import type { ListingCardItem, MyListingItem, Page } from '@zoink/shared'
import { DEMO_MODE } from '../config/demoMode'
import { getImageUploadPart } from './uploadFormData'
// Demo-mode mocks load only in a dev build that sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockBrowseListings,
  mockCreateListing,
  mockDeleteListing,
  mockDeleteListingImage,
  mockGetListing,
  mockGetMyListings,
  mockSetAvailability,
  mockUpdateListing,
  mockUploadListingImage,
} = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockListings') : {}) as typeof import('./mockListings')

export type BrowseListingsParams = {
  query?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  lat?: number
  lng?: number
  radius?: number
}

const PAGE_SIZE = 20

/** One page of browse/search results (cards only), nearest first when a location is given. */
export async function browseListingsPage(
  { query, category, minPrice, maxPrice, lat, lng, radius = 25, limit = PAGE_SIZE }: BrowseListingsParams & { limit?: number },
  cursor?: string
): Promise<Page<ListingCardItem>> {
  if (DEMO_MODE) {
    const result = await mockBrowseListings({ query, category, minPrice, maxPrice, lat, lng, radius })
    return { items: result.items.slice(0, limit), nextCursor: null }
  }

  const res = await api.get('/listings', {
    params: {
      q: query || undefined,
      category: category || undefined,
      minPrice,
      maxPrice,
      latitude: lat,
      longitude: lng,
      radiusKm: lat != null && lng != null ? radius : undefined,
      limit,
      cursor,
    },
  })
  return res.data
}

/** One page of the owner's listings, most recent booking activity first. */
export async function getMyListingsPage(cursor?: string): Promise<Page<MyListingItem>> {
  if (DEMO_MODE) {
    const items = await mockGetMyListings()
    return { items: items.map((listing) => ({ ...listing, activeBookingId: null })), nextCursor: null }
  }

  const res = await api.get('/listings/me', { params: { limit: PAGE_SIZE, cursor } })
  return res.data
}

export type CreateListingPayload = {
  title: string
  description: string
  category: string
  dailyPrice: number
  itemValue?: number
  depositAmount?: number
  latitude: number
  longitude: number
  city: string
  address?: string
}

export async function createListing(data: CreateListingPayload): Promise<Listing> {
  if (DEMO_MODE) return mockCreateListing(data)

  const res = await api.post('/listings', data)
  return res.data
}

export async function getListing(id: string): Promise<Listing> {
  if (DEMO_MODE) return mockGetListing(id)

  const res = await api.get(`/listings/${id}`)
  return res.data
}

export type UpdateListingPayload = Partial<CreateListingPayload>

export async function updateListing(id: string, data: UpdateListingPayload): Promise<Listing> {
  if (DEMO_MODE) return mockUpdateListing(id, data)

  const res = await api.patch(`/listings/${id}`, data)
  return res.data
}

export async function setAvailability(
  id: string,
  isAvailable: boolean
): Promise<{ id: string; isAvailable: boolean }> {
  if (DEMO_MODE) return mockSetAvailability(id, isAvailable)

  const res = await api.patch(`/listings/${id}/availability`, { isAvailable })
  return res.data
}

export async function deleteListing(id: string): Promise<void> {
  if (DEMO_MODE) return mockDeleteListing(id)

  await api.delete(`/listings/${id}`)
}

export async function uploadListingImage(listingId: string, uri: string): Promise<ListingImage> {
  if (DEMO_MODE) return mockUploadListingImage(listingId, uri)

  const formData = new FormData()

  formData.append('image', getImageUploadPart(uri) as any)

  const res = await api.post(`/listings/${listingId}/images`, formData)

  return res.data
}

export async function deleteListingImage(listingId: string, imageId: string): Promise<void> {
  if (DEMO_MODE) return mockDeleteListingImage(listingId, imageId)

  await api.delete(`/listings/${listingId}/images/${imageId}`)
}
