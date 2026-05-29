import api from './api'
import { Booking } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import {
  mockAcceptBooking,
  mockActivateBooking,
  mockCancelBooking,
  mockCompleteBooking,
  mockCreateBooking,
  mockDeclineBooking,
  mockGetBooking,
  mockGetIncomingRequests,
  mockGetMyBookings,
} from './mockWeek6'

export type CreateBookingPayload = {
  listingId: string
  startDate: string
  endDate: string
  message?: string
  insuranceOptIn?: boolean
}

export async function createBooking(data: CreateBookingPayload): Promise<Booking> {
  if (DEMO_MODE) return mockCreateBooking(data)

  const res = await api.post('/bookings', data)
  return res.data
}

export async function getMyBookings(): Promise<Booking[]> {
  if (DEMO_MODE) return mockGetMyBookings()

  const res = await api.get('/bookings/me')
  return res.data
}

export async function getIncomingRequests(): Promise<Booking[]> {
  if (DEMO_MODE) return mockGetIncomingRequests()

  const res = await api.get('/bookings/requests')
  return res.data
}

export async function getBooking(id: string): Promise<Booking> {
  if (DEMO_MODE) return mockGetBooking(id)

  const res = await api.get(`/bookings/${id}`)
  return res.data
}

async function patchBooking(path: string, fallback: () => Promise<Booking>) {
  if (DEMO_MODE) return fallback()

  const res = await api.patch(path)
  return res.data
}

export function acceptBooking(id: string) {
  return patchBooking(`/bookings/${id}/accept`, () => mockAcceptBooking(id))
}

export function declineBooking(id: string) {
  return patchBooking(`/bookings/${id}/decline`, () => mockDeclineBooking(id))
}

export function cancelBooking(id: string) {
  return patchBooking(`/bookings/${id}/cancel`, () => mockCancelBooking(id))
}

export function activateBooking(id: string) {
  return patchBooking(`/bookings/${id}/activate`, () => mockActivateBooking(id))
}

export function completeBooking(id: string) {
  return patchBooking(`/bookings/${id}/complete`, () => mockCompleteBooking(id))
}

export async function uploadHandoffPhotos(id: string, phase: 'pickup' | 'return', photoUrls: string[]): Promise<Booking> {
  if (DEMO_MODE) return mockGetBooking(id)

  const res = await api.post(`/bookings/${id}/photos`, { phase, photoUrls })
  return res.data
}

export async function uploadHandoffPhotoImage(id: string, uri: string): Promise<string> {
  if (DEMO_MODE) return 'https://demo-image-url.com/photo.jpg'

  const formData = new FormData()
  const filename = uri.split('/').pop() ?? 'photo.jpg'
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'

  formData.append('image', { uri, name: filename, type: mimeType } as any)

  const res = await api.post(`/bookings/${id}/photos/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  return res.data.url
}

export async function zoinkTap(id: string, phase: 'pickup' | 'return'): Promise<Booking> {
  if (DEMO_MODE) return mockGetBooking(id)

  const res = await api.post(`/bookings/${id}/zoink-tap`, { phase })
  return res.data
}
