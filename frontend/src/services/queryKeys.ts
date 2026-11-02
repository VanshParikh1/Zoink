import type { DisputeStatus, ReportStatus } from '../types'

// Every cache key in one place, so a mutation can invalidate exactly what it
// changed (a prefix such as ['bookings'] covers every booking entry).
export const queryKeys = {
  browse: (params: { query?: string; category?: string; lat?: number; lng?: number; radius?: number; limit?: number }) =>
    ['listings', 'browse', params] as const,
  listing: (id: string) => ['listings', 'detail', id] as const,
  myListings: ['listings', 'mine'] as const,

  bookingList: (party: 'renter' | 'owner') => ['bookings', 'list', party] as const,
  booking: (id: string) => ['bookings', 'detail', id] as const,
  handoffPhotos: (id: string) => ['bookings', 'photos', id] as const,
  bookingDispute: (bookingId: string) => ['disputes', 'booking', bookingId] as const,

  inbox: ['conversations', 'inbox'] as const,
  conversation: (id: string) => ['conversations', 'detail', id] as const,

  firstPendingReview: ['reviews', 'pending', 'first'] as const,

  myProfile: (userId: string) => ['users', 'me', userId] as const,
  publicProfile: (userId: string) => ['users', 'profile', userId] as const,
  blocks: ['users', 'blocks'] as const,

  adminDisputes: (status?: DisputeStatus) => ['admin', 'disputes', status ?? 'all'] as const,
  adminDispute: (id: string) => ['admin', 'dispute', id] as const,
  bookingEvents: (bookingId: string) => ['admin', 'events', bookingId] as const,
  adminReports: (status?: ReportStatus) => ['admin', 'reports', status ?? 'all'] as const,
}
