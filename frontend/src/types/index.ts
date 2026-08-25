export type {
  VerificationStatus,
  BookingStatus,
  PaymentStatus,
  DisputeStatus,
  DisputeReason,
  Dispute,
  ReviewRole,
  BookingEvent,
  BookingEventType,
  ReportTargetType,
  ReportReason,
  ReportStatus,
  Report,
} from '@zoink/shared'

export type {
  UserSummary,
  UserSummary as User,
  ListingImageSummary as ListingImage,
  ListingResponse as Listing,
  ListingBrowseItem,
  UserReputationResponse as UserReputation,
  BookingResponse as Booking,
  BookingListingSnapshot as ListingPreview,
  ReviewResponse as Review,
  PendingReviewResponse as PendingReview,
  SubmitReviewResult as SubmittedReviewResult,
  ConversationResponse as Conversation,
  ConversationMessagePreview,
  MessageResponse as Message,
} from '@zoink/shared'

import type {
  PublicProfileResponse,
  MyProfileResponse,
  ListingBrowseItem,
  BookingStatus,
  PaymentStatus,
  DisputeStatus,
  DisputeReason,
  ReportTargetType,
  ReportReason,
  ReportStatus,
} from '@zoink/shared'

// Decorative, demo-mode-only fields — the real backend never returns these.
export interface ProfileReviewHighlight {
  id: string
  quote: string
  label: string
}

export type PublicProfile = PublicProfileResponse & {
  spotlightTags?: string[]
  reviewHighlights?: ProfileReviewHighlight[]
}

// getMyProfile() in usersApi.ts merges /users/me (email, phone) with
// /users/{id} (reputation and the rest of the public profile fields), so the
// composed frontend MyProfile extends the public shape rather than getMe()'s
// raw response.
export type MyProfile = PublicProfileResponse &
  Pick<MyProfileResponse, 'email' | 'phone'> & {
    spotlightTags?: string[]
    reviewHighlights?: ProfileReviewHighlight[]
  }

// Frontend-facing shape: flattened from the backend's { items, meta } envelope
// by listingsApi.browseListings, which reads meta.total / meta.hasMore.
export interface BrowseListingsResult {
  items: ListingBrowseItem[]
  total: number
  hasMore: boolean
}

// Admin dispute endpoints return raw Prisma rows (not the DTO-mapped shapes used
// elsewhere), so totalPrice comes through as a Decimal-serialized string, not a number.
export interface AdminDisputeListItem {
  id: string
  bookingId: string
  raisedByUserId: string
  reason: DisputeReason
  description: string
  status: DisputeStatus
  resolutionNotes: string | null
  resolvedByAdminId: string | null
  // Cents refunded via Stripe, set only when status is RESOLVED_REFUND (may be less
  // than booking.totalPrice for a partial refund). Null for every other resolution.
  refundAmountCents: number | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  booking: {
    id: string
    status: BookingStatus
    totalPrice: string
  }
  raisedByUser: {
    id: string
    email: string
    firstName: string
  }
}

export interface AdminDisputeDetail extends Omit<AdminDisputeListItem, 'booking'> {
  booking: {
    id: string
    status: BookingStatus
    paymentStatus: PaymentStatus
    totalPrice: string
    depositAmount: string
    pickupPhotos: string[]
    returnPhotos: string[]
    handoffInitiatedAt: string | null
    returnInitiatedAt: string | null
  }
  resolvedByAdmin: {
    id: string
    email: string
    firstName: string
  } | null
}

// Admin report endpoint returns raw Prisma rows (not DTO-mapped), same shape
// as AdminDisputeListItem above.
export interface AdminReportListItem {
  id: string
  reporterId: string
  targetType: ReportTargetType
  targetId: string
  // Human-readable target name resolved server-side (listing title / user's
  // full name). Falls back to "[deleted listing]" / "[deleted user]" when
  // the target no longer exists.
  targetLabel: string
  reason: ReportReason
  description: string | null
  status: ReportStatus
  adminNotes: string | null
  createdAt: string
  reviewedAt: string | null
  reviewedByAdminId: string | null
  reporter: {
    id: string
    email: string
    firstName: string
  }
}
