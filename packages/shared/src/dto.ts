import type {
  VerificationStatus,
  BookingStatus,
  PaymentStatus,
  DisputeStatus,
  ReviewRole,
  ReviewObligationStatus,
} from '../generated/prisma-models'

// Narrow, safe user projection used across booking/listing/conversation/review
// responses. Deliberately excludes internal fields like stripeCustomerId /
// stripeAccountId that live on the User model but must never reach the client.
export interface UserSummary {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  verificationStatus?: VerificationStatus
}

export interface ListingImageSummary {
  id: string
  url: string
  order: number
}

export interface ListingResponse {
  id: string
  title: string
  description: string
  category: string
  dailyPrice: string
  itemValue: string
  depositAmount: string
  isAvailable: boolean
  latitude: number
  longitude: number
  city: string
  address: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  owner: UserSummary
  images: ListingImageSummary[]
}

export interface ListingBrowseItem extends ListingResponse {
  distanceKm: number | null
}

export interface BrowseListingsResult {
  items: ListingBrowseItem[]
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface UserReputationResponse {
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

export interface PublicProfileResponse {
  id: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  bio: string | null
  verificationStatus: VerificationStatus
  verifiedAt: string | null
  createdAt: string
  reputation: UserReputationResponse | null
}

// getMe() does not fetch reputation — this is intentionally its own shape
// rather than extending PublicProfileResponse.
export interface MyProfileResponse {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  avatarUrl: string | null
  bio: string | null
  verificationStatus: VerificationStatus
  verifiedAt: string | null
  createdAt: string
}

export interface ReviewObligationScoreLabels {
  scoreAKey: string
  scoreBKey: string
  scoreCKey: string
}

export interface PendingReviewResponse {
  id: string
  bookingId: string
  reviewerRole: ReviewRole
  status: ReviewObligationStatus
  scoreLabels: ReviewObligationScoreLabels
  createdAt: string
  reviewee: UserSummary
  booking: {
    id: string
    startDate: string
    endDate: string
    completedAt: string | null
    listing: Pick<ListingResponse, 'id' | 'title' | 'category' | 'images'>
  }
}

export interface ReviewResponse {
  id: string
  bookingId: string
  reviewerId: string
  revieweeId: string
  reviewerRole: ReviewRole
  scoreA: number
  scoreB: number
  scoreC: number
  itemRating: number | null
  itemNotes: string | null
  personNotes: string | null
  createdAt: string
}

export interface SubmitReviewResult {
  review: ReviewResponse
  pendingRemaining: number
  reviewee: UserSummary
  booking: {
    id: string
    listing: Pick<ListingResponse, 'id' | 'title'>
  }
}

export interface BookingListingSnapshot {
  id: string
  title: string
  category: string
  dailyPrice: string
  itemValue: string
  city: string
  address: string | null
  isAvailable: boolean
  images: ListingImageSummary[]
}

export interface ReviewObligationSummary {
  id: string
  userId: string
  targetUserId: string
  reviewerRole: ReviewRole
  status: ReviewObligationStatus
  submittedReviewId: string | null
  createdAt: string
  updatedAt: string
}

export interface BookingResponse {
  id: string
  status: BookingStatus
  version: number
  startDate: string
  endDate: string
  totalPrice: number
  message: string | null
  paymentStatus: PaymentStatus
  depositAmount: number
  commissionAmount: number
  ownerPayout: number
  insuranceOptIn: boolean
  insuranceFee: number
  stripePaymentIntentId: string | null
  stripeChargeId: string | null
  stripeTransferId: string | null
  paidAt: string | null
  refundedAt: string | null
  payoutSentAt: string | null
  pickupPhotos: string[]
  returnPhotos: string[]
  handoffInitiatedAt: string | null
  returnInitiatedAt: string | null
  ownerPickupTappedAt: string | null
  renterPickupTappedAt: string | null
  ownerReturnTappedAt: string | null
  renterReturnTappedAt: string | null
  disputeStatus: DisputeStatus
  disputedAt: string | null
  disputeReason: string | null
  renterId: string
  ownerId: string
  listingId: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  listing: BookingListingSnapshot
  renter: UserSummary
  owner: UserSummary
  reviewObligations: ReviewObligationSummary[]
  pendingReview: PendingReviewResponse | null
  paymentClientSecret?: string | null
}

export interface ConversationListingSnapshot {
  id: string
  title: string
  category: string
  city: string
  dailyPrice: string
  images: ListingImageSummary[]
}

export interface ConversationMessagePreview {
  id: string
  body: string
  senderId: string
  createdAt: string
}

export interface ConversationResponse {
  id: string
  listingId: string
  listing: ConversationListingSnapshot
  renterId: string
  renter: UserSummary
  ownerId: string
  owner: UserSummary
  createdAt: string
  updatedAt: string
  lastMessage: ConversationMessagePreview | null
  unread: boolean
}

export interface MessageResponse {
  id: string
  conversationId: string
  senderId: string
  sender: UserSummary
  body: string
  createdAt: string
}
