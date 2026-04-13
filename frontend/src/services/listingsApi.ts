import api from './api'
import { Listing, ListingImage } from '../types'

// ── Create a listing ──────────────────────────────────────────────────────────

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
  const res = await api.post('/listings', data)
  return res.data
}

// ── Get a single listing ──────────────────────────────────────────────────────

export async function getListing(id: string): Promise<Listing> {
  const res = await api.get(`/listings/${id}`)
  return res.data
}

// ── Get listings I own ────────────────────────────────────────────────────────

export async function getMyListings(): Promise<Listing[]> {
  const res = await api.get('/listings/me')
  return res.data
}

// ── Update a listing ──────────────────────────────────────────────────────────

export type UpdateListingPayload = Partial<CreateListingPayload>

export async function updateListing(id: string, data: UpdateListingPayload): Promise<Listing> {
  const res = await api.patch(`/listings/${id}`, data)
  return res.data
}

// ── Toggle availability ───────────────────────────────────────────────────────

export async function setAvailability(id: string, isAvailable: boolean): Promise<{ id: string; isAvailable: boolean }> {
  const res = await api.patch(`/listings/${id}/availability`, { isAvailable })
  return res.data
}

// ── Delete a listing ──────────────────────────────────────────────────────────

export async function deleteListing(id: string): Promise<void> {
  await api.delete(`/listings/${id}`)
}

// ── Upload an image to a listing ──────────────────────────────────────────────

export async function uploadListingImage(listingId: string, uri: string): Promise<ListingImage> {
  const formData = new FormData()
  const filename = uri.split('/').pop() ?? 'photo.jpg'
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

  // React Native FormData accepts plain objects for files
  formData.append('image', { uri, name: filename, type: mimeType } as any)

  const res = await api.post(`/listings/${listingId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

// ── Delete an image from a listing ───────────────────────────────────────────

export async function deleteListingImage(listingId: string, imageId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/images/${imageId}`)
}
