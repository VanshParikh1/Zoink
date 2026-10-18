import api from './api'
import { Booking } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import { getImageUploadPart } from './uploadFormData'
// Demo-mode mocks load only in a dev build that sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockAcceptBooking,
  mockCancelBooking,
  mockConfirmBookingPayment,
  mockConfirmHandoff,
  mockCreateBooking,
  mockCreateBookingPaymentIntent,
  mockDeclineBooking,
  mockGetBooking,
  mockGetIncomingRequests,
  mockGetMyBookings,
  mockInitiateHandoff,
  mockUploadHandoffPhoto,
} = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockWeek6') : {}) as typeof import('./mockWeek6')

// insuranceOptIn deliberately omitted — Zoink offers no insurance product at
// launch (terms.md §12) and the backend no longer accepts the field. See
// legal/OPEN-ITEMS.md B1.
export type CreateBookingPayload = {
  listingId: string
  startDate: string
  endDate: string
  message?: string
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

export async function createBookingPaymentIntent(id: string): Promise<Booking> {
  if (DEMO_MODE) return mockCreateBookingPaymentIntent(id)

  const res = await api.post(`/bookings/${id}/payment-intent`)
  return res.data
}

export function confirmBookingPayment(id: string) {
  return patchBooking(`/bookings/${id}/confirm`, () => mockConfirmBookingPayment(id))
}

export function declineBooking(id: string) {
  return patchBooking(`/bookings/${id}/decline`, () => mockDeclineBooking(id))
}

export function cancelBooking(id: string) {
  return patchBooking(`/bookings/${id}/cancel`, () => mockCancelBooking(id))
}

export async function initiateHandoff(id: string, phase: 'pickup' | 'return', photos: string[]): Promise<Booking> {
  if (DEMO_MODE) return mockInitiateHandoff(id, phase, photos)

  const res = await api.post(`/bookings/${id}/${phase}/initiate`, { photos })
  return res.data
}

export async function uploadHandoffPhotoImage(id: string, uri: string, phase: 'pickup' | 'return'): Promise<string> {
  if (DEMO_MODE) return mockUploadHandoffPhoto(phase)

  const formData = new FormData()

  formData.append('image', getImageUploadPart(uri) as any)

  const res = await api.post(`/bookings/${id}/photos/upload`, formData)

  return res.data.url
}

export type HandoffConfirmResult = {
  bothConfirmed: boolean
  booking: Booking
}

export async function confirmHandoff(id: string, phase: 'pickup' | 'return'): Promise<HandoffConfirmResult> {
  if (DEMO_MODE) {
    return mockConfirmHandoff(id, phase)
  }

  const res = await api.post(`/bookings/${id}/${phase}/confirm`)
  return res.data
}

export async function getHandoffPhotos(id: string): Promise<{ pickupPhotos: string[]; returnPhotos: string[] }> {
  if (DEMO_MODE) {
    const booking = await mockGetBooking(id)
    return { pickupPhotos: booking.pickupPhotos ?? [], returnPhotos: booking.returnPhotos ?? [] }
  }

  const res = await api.get(`/bookings/${id}/photos`)
  return res.data
}
