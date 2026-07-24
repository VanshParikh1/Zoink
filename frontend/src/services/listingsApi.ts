import api from './api'
import { BrowseListingsResult, Listing, ListingBrowseItem, ListingImage } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import { getImageUploadPart } from './uploadFormData'
import {
  mockBrowseListings,
  mockCreateListing,
  mockDeleteListing,
  mockDeleteListingImage,
  mockGetListing,
  mockGetListingCategories,
  mockGetMyListings,
  mockGetNearbyListings,
  mockSetAvailability,
  mockUpdateListing,
  mockUploadListingImage,
} from './mockListings'

export type NearbyListingsParams = {
  lat: number
  lng: number
  radius?: number
}

export type BrowseListingsParams = {
  query?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  lat?: number
  lng?: number
  radius?: number
}

export async function getNearbyListings({
  lat,
  lng,
  radius = 25,
}: NearbyListingsParams): Promise<ListingBrowseItem[]> {
  if (DEMO_MODE) return mockGetNearbyListings()

  const res = await api.get('/listings', {
    params: { latitude: lat, longitude: lng, radiusKm: radius },
  })

  return res.data.items ?? res.data
}

export async function browseListings({
  query,
  category,
  minPrice,
  maxPrice,
  lat,
  lng,
  radius = 25,
}: BrowseListingsParams): Promise<BrowseListingsResult> {
  if (DEMO_MODE) {
    return mockBrowseListings({
      query,
      category,
      minPrice,
      maxPrice,
      lat,
      lng,
      radius,
    })
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
    },
  })

  return {
    items: res.data.items ?? [],
    total: res.data.meta?.total ?? res.data.items?.length ?? 0,
    hasMore: res.data.meta?.hasMore ?? false,
  }
}

export async function getListingCategories(): Promise<string[]> {
  if (DEMO_MODE) return mockGetListingCategories()

  const res = await api.get('/listings/categories')
  return res.data.categories ?? []
}

export type CreateListingPayload = {
  title: string
  description: string
  category: string
  dailyPrice: number
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

export async function getMyListings(): Promise<Listing[]> {
  if (DEMO_MODE) return mockGetMyListings()

  const res = await api.get('/listings/me')
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
