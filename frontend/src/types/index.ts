export type VerificationStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'FAILED'

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  avatarUrl?: string
  bio?: string
  verificationStatus: VerificationStatus
  createdAt: string
}

export interface Listing {
  id: string
  title: string
  description: string
  category: string
  dailyPrice: number
  isAvailable: boolean
  latitude: number
  longitude: number
  city: string
  ownerId: string
  owner: User
  images: ListingImage[]
  createdAt: string
}

export interface ListingImage {
  id: string
  url: string
  order: number
}

export interface Booking {
  id: string
  status: BookingStatus
  startDate: string
  endDate: string
  totalPrice: number
  message?: string
  renterId: string
  renter: User
  ownerId: string
  owner: User
  listingId: string
  listing: Listing
  createdAt: string
}

export interface Review {
  id: string
  rating: number
  comment?: string
  authorId: string
  author: User
  subjectId: string
  listingId: string
  bookingId: string
  createdAt: string
}