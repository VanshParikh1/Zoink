export type {
  VerificationStatus,
  BookingStatus,
  PaymentStatus,
  DisputeStatus,
  ReviewRole,
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

import type { PublicProfileResponse, MyProfileResponse, ListingBrowseItem } from '@zoink/shared'

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
