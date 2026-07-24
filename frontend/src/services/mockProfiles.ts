import { DEMO_USER } from '../config/demoMode'
import { MyProfile, PublicProfile, User } from '../types'

const now = new Date().toISOString()

export const demoProfile: MyProfile = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  firstName: DEMO_USER.firstName,
  lastName: 'Mistry',
  phone: '(416) 555-0192',
  avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
  bio: 'Weekend snowboarder, film camera collector, and the friend who always has a speaker ready.',
  verificationStatus: 'VERIFIED',
  verifiedAt: now,
  createdAt: '2026-02-12T15:30:00.000Z',
  spotlightTags: ['Snow gear lender', 'Fast replies', 'Downtown campus'],
  reviewHighlights: [
    {
      id: 'demo-highlight-1',
      quote: 'Pickup was smooth, the speaker was spotless, and the handoff felt super easy.',
      label: 'From a renter',
    },
    {
      id: 'demo-highlight-2',
      quote: 'Returned everything on time and even packed it better than I did.',
      label: 'From an owner',
    },
  ],
  reputation: {
    reviewsReceivedCount: 18,
    rentalsCompletedCount: 11,
    overallRenterRating: 4.8,
    overallLenderRating: 4.9,
    renterReliabilityAvg: 4.9,
    renterCareAvg: 4.7,
    renterCommunicationAvg: 4.8,
    lenderAccuracyAvg: 4.9,
    lenderConditionAvg: 4.8,
    lenderCommunicationAvg: 5,
    updatedAt: now,
  },
}

export const publicProfiles: Record<string, PublicProfile> = {
  [demoProfile.id]: demoProfile,
  'demo-user-2': {
    id: 'demo-user-2',
    firstName: 'Avery',
    lastName: 'Chen',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    bio: 'I keep my gear clean, my replies fast, and my pickup windows flexible.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2026-01-30T12:00:00.000Z',
    spotlightTags: ['Camera kit expert', 'Flexible pickup', 'Party approved'],
    reviewHighlights: [
      {
        id: 'avery-highlight-1',
        quote: 'Exactly as described and replied in minutes when I had a question.',
        label: 'Lender review vibe',
      },
      {
        id: 'avery-highlight-2',
        quote: 'Lens was clean, batteries were charged, and pickup instructions were crystal clear.',
        label: 'Most common praise',
      },
    ],
    reputation: {
      reviewsReceivedCount: 24,
      rentalsCompletedCount: 16,
      overallRenterRating: 4.7,
      overallLenderRating: 4.95,
      renterReliabilityAvg: 4.8,
      renterCareAvg: 4.6,
      renterCommunicationAvg: 4.7,
      lenderAccuracyAvg: 5,
      lenderConditionAvg: 4.9,
      lenderCommunicationAvg: 4.95,
      updatedAt: now,
    },
  },
  'demo-user-3': {
    id: 'demo-user-3',
    firstName: 'Jordan',
    lastName: 'Lopez',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
    bio: 'Fast pickup, careful returns, and way too many camping accessories.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2026-03-02T10:15:00.000Z',
    spotlightTags: ['Outdoors setup', 'Careful borrower', 'Weekend friendly'],
    reviewHighlights: [
      {
        id: 'jordan-highlight-1',
        quote: 'Reliable, easygoing, and took great care of the equipment.',
        label: 'Borrower highlight',
      },
    ],
    reputation: {
      reviewsReceivedCount: 9,
      rentalsCompletedCount: 7,
      overallRenterRating: 4.6,
      overallLenderRating: 4.7,
      renterReliabilityAvg: 4.8,
      renterCareAvg: 4.5,
      renterCommunicationAvg: 4.6,
      lenderAccuracyAvg: 4.8,
      lenderConditionAvg: 4.6,
      lenderCommunicationAvg: 4.7,
      updatedAt: now,
    },
  },
}

export function toDemoUser(profile: PublicProfile | MyProfile): User {
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    avatarUrl: profile.avatarUrl,
    verificationStatus: profile.verificationStatus,
  }
}

export async function mockGetMyProfile(): Promise<MyProfile> {
  return demoProfile
}

export async function mockGetPublicProfile(userId: string): Promise<PublicProfile> {
  return publicProfiles[userId] ?? demoProfile
}

export async function mockUpdateMyProfile(data: Partial<Pick<MyProfile, 'firstName' | 'lastName' | 'phone' | 'bio'>>): Promise<MyProfile> {
  Object.assign(demoProfile, data)
  publicProfiles[demoProfile.id] = demoProfile
  return demoProfile
}

export async function mockUploadMyAvatar(uri: string): Promise<{ id: string; avatarUrl?: string }> {
  demoProfile.avatarUrl = uri
  publicProfiles[demoProfile.id] = demoProfile
  return { id: demoProfile.id, avatarUrl: demoProfile.avatarUrl }
}
