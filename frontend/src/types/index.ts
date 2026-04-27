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
  address?: string
  ownerId: string
  owner: User
  images: ListingImage[]
  createdAt: string
  updatedAt?: string
  distanceKm?: number
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
  depositAmount: number
  message?: string
  renterId: string
  renter: User
  ownerId: string
  owner: User
  listingId: string
  listing: ListingPreview
  createdAt: string
}

export interface ListingPreview {
  id: string
  title: string
  category: string
  dailyPrice: number
  city: string
  address?: string
  isAvailable: boolean
  images: ListingImage[]
}

export interface Conversation {
  id: string
  listingId: string
  listing: ListingPreview
  renterId: string
  renter: User
  ownerId: string
  owner: User
  createdAt: string
  updatedAt: string
  lastMessage: ConversationMessagePreview | null
  unread: boolean
}

export interface ConversationMessagePreview {
  id: string
  body: string
  senderId: string
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  sender: User
  body: string
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
