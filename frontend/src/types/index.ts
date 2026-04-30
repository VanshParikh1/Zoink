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

export interface UserReputation {
  reviewsReceivedCount: number
  rentalsCompletedCount: number
  overallRenterRating: number | null
  overallLenderRating: number | null
  renterReliabilityAvg: number | null
  renterCareAvg: number | null
  renterCommunicationAvg: number | null
  lenderAccuracyAvg: number | null
  lenderConditionAvg: number | null
  lenderCommunicationAvg: number | null
  updatedAt: string
}

export interface ProfileReviewHighlight {
  id: string
  quote: string
  label: string
}

export interface PublicProfile {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string
  bio?: string
  verificationStatus: VerificationStatus
  verifiedAt?: string | null
  createdAt: string
  reputation: UserReputation | null
  spotlightTags?: string[]
  reviewHighlights?: ProfileReviewHighlight[]
}

export interface MyProfile extends PublicProfile {
  email: string
  phone?: string
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

export interface BrowseListingsResult {
  items: Listing[]
  total: number
  hasMore: boolean
}

export interface Booking {
  id: string
  status: BookingStatus
  startDate: string
  endDate: string
  completedAt?: string | null
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
  pendingReview?: PendingReview | null
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
  reviewerRole: 'RENTER' | 'LENDER'
  scoreA: number
  scoreB: number
  scoreC: number
  comment?: string
  reviewerId: string
  revieweeId: string
  bookingId: string
  createdAt: string
}

export interface PendingReview {
  id: string
  bookingId: string
  reviewerRole: 'RENTER' | 'LENDER'
  status: 'PENDING' | 'SUBMITTED'
  scoreLabels: {
    scoreAKey: string
    scoreBKey: string
    scoreCKey: string
  }
  createdAt: string
  reviewee: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>
  booking: {
    id: string
    startDate: string
    endDate: string
    completedAt?: string | null
    listing: Pick<ListingPreview, 'id' | 'title' | 'category' | 'images'>
  }
}

export interface SubmittedReviewResult {
  review: Review
  pendingRemaining: number
  reviewee: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>
  booking: {
    id: string
    listing: Pick<ListingPreview, 'id' | 'title'>
  }
}
