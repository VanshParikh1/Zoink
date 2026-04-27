import api from './api'
import { Listing, ListingImage } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import {
  mockCreateListing,
  mockDeleteListing,
  mockDeleteListingImage,
  mockGetListing,
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

export async function getNearbyListings({
  lat,
  lng,
  radius = 25,
}: NearbyListingsParams): Promise<Listing[]> {
  if (DEMO_MODE) return mockGetNearbyListings()

  const res = await api.get('/listings', {
    params: { latitude: lat, longitude: lng, radiusKm: radius },
  })

  return res.data.items
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
  const filename = uri.split('/').pop() ?? 'photo.jpg'
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

  formData.append('image', { uri, name: filename, type: mimeType } as any)

  const res = await api.post(`/listings/${listingId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  return res.data
}

export async function deleteListingImage(listingId: string, imageId: string): Promise<void> {
  if (DEMO_MODE) return mockDeleteListingImage(listingId, imageId)

  await api.delete(`/listings/${listingId}/images/${imageId}`)
}
