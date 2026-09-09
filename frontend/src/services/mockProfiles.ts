import { DEMO_USER } from '../config/demoMode'
import { MyProfile, NotificationPreferences, PublicProfile, User } from '../types'

const now = new Date().toISOString()

// DiceBear "notionists" avatars — generated, not real people. PNG (not SVG) so
// React Native's <Image> can render them directly, same as the previous
// Unsplash URLs. Seeded by name so every screenshot run is identical.
function avatar(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(seed)}&size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  notifyMessages: true,
  notifyBookingActivity: true,
  notifyPaymentsPayouts: true,
  notifyDepositUpdates: true,
  notifyReviews: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo dataset — the single source of demo users. `demoProfile` is the
// logged-in user (demo-user-1); `DEMO_PUBLIC_PROFILES` is everyone the app can
// look up (owners on listings, the other side of bookings/conversations, and
// public-profile screens). All verified so the verified badge shows everywhere.
// University domains informed the names (GTA schools) but are not stored on the
// profile — nothing in the UI surfaces another user's email/university.
// ─────────────────────────────────────────────────────────────────────────────

export const demoProfile: MyProfile = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  firstName: DEMO_USER.firstName,
  lastName: 'Mistry',
  phone: '(416) 555-0192',
  avatarUrl: avatar('Mihir Mistry'),
  bio: 'Weekend snowboarder, film camera collector, and the friend who always has a speaker ready.',
  verificationStatus: 'VERIFIED',
  verifiedAt: now,
  createdAt: '2026-02-12T15:30:00.000Z',
  termsVersion: DEMO_USER.termsVersion,
  privacyVersion: DEMO_USER.privacyVersion,
  termsAcceptedAt: now,
  notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
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

export const DEMO_PUBLIC_PROFILES: Record<string, PublicProfile> = {
  [demoProfile.id]: demoProfile,

  'demo-user-2': {
    id: 'demo-user-2',
    firstName: 'Avery',
    lastName: 'Chen',
    avatarUrl: avatar('Avery Chen'),
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
    avatarUrl: avatar('Jordan Lopez'),
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

  'demo-user-4': {
    id: 'demo-user-4',
    firstName: 'Priya',
    lastName: 'Sharma',
    avatarUrl: avatar('Priya Sharma'),
    bio: 'Photography major renting out the kit I am not using this semester. Ask me for settings tips.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2025-09-18T09:00:00.000Z',
    spotlightTags: ['Photo major', 'Detailed listings', 'St. George campus'],
    reviewHighlights: [
      {
        id: 'priya-highlight-1',
        quote: 'Gave me a two-minute crash course on the body before I left. Above and beyond.',
        label: 'From a renter',
      },
      {
        id: 'priya-highlight-2',
        quote: 'Every accessory in the photo was in the bag. No surprises.',
        label: 'Most common praise',
      },
    ],
    reputation: {
      reviewsReceivedCount: 31,
      rentalsCompletedCount: 22,
      overallRenterRating: 4.9,
      overallLenderRating: 4.9,
      renterReliabilityAvg: 4.9,
      renterCareAvg: 4.9,
      renterCommunicationAvg: 5,
      lenderAccuracyAvg: 4.9,
      lenderConditionAvg: 4.8,
      lenderCommunicationAvg: 4.9,
      updatedAt: now,
    },
  },

  'demo-user-5': {
    id: 'demo-user-5',
    firstName: 'Daniel',
    lastName: 'Kim',
    avatarUrl: avatar('Daniel Kim'),
    bio: 'Run sound for campus events. Speakers, mixers, and lights available most weekends.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2025-11-04T14:20:00.000Z',
    spotlightTags: ['Event audio', 'Bulk discounts', 'Loads in a sedan'],
    reviewHighlights: [
      {
        id: 'daniel-highlight-1',
        quote: 'Showed up with spare cables I did not even know I needed. Saved the show.',
        label: 'From a renter',
      },
    ],
    reputation: {
      reviewsReceivedCount: 14,
      rentalsCompletedCount: 12,
      overallRenterRating: 4.5,
      overallLenderRating: 4.7,
      renterReliabilityAvg: 4.4,
      renterCareAvg: 4.6,
      renterCommunicationAvg: 4.5,
      lenderAccuracyAvg: 4.7,
      lenderConditionAvg: 4.6,
      lenderCommunicationAvg: 4.8,
      updatedAt: now,
    },
  },

  'demo-user-6': {
    id: 'demo-user-6',
    firstName: 'Sofia',
    lastName: 'Rossi',
    avatarUrl: avatar('Sofia Rossi'),
    bio: 'Woodworking hobbyist. Happy to lend tools and talk you out of buying one for a single project.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2026-01-08T11:45:00.000Z',
    spotlightTags: ['Tool library', 'Project advice', 'Waterloo pickup'],
    reviewHighlights: [
      {
        id: 'sofia-highlight-1',
        quote: 'Tools were sharp, charged, and came in a proper case. Clearly looked after.',
        label: 'Most common praise',
      },
    ],
    reputation: {
      reviewsReceivedCount: 8,
      rentalsCompletedCount: 6,
      overallRenterRating: 4.7,
      overallLenderRating: 4.8,
      renterReliabilityAvg: 4.7,
      renterCareAvg: 4.8,
      renterCommunicationAvg: 4.6,
      lenderAccuracyAvg: 4.8,
      lenderConditionAvg: 4.9,
      lenderCommunicationAvg: 4.7,
      updatedAt: now,
    },
  },

  'demo-user-7': {
    id: 'demo-user-7',
    firstName: 'Marcus',
    lastName: 'Bennett',
    avatarUrl: avatar('Marcus Bennett'),
    bio: 'Cycling club exec. Commuter bikes and a bike stand you can borrow for tune-ups.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2025-10-22T08:30:00.000Z',
    spotlightTags: ['Bike guy', 'Keele campus', 'Helmet included'],
    reviewHighlights: [
      {
        id: 'marcus-highlight-1',
        quote: 'Bike was tuned and the lock combo was ready. Rode off in two minutes.',
        label: 'From a renter',
      },
      {
        id: 'marcus-highlight-2',
        quote: 'Easy to reach and totally chill about a slightly late return.',
        label: 'Borrower highlight',
      },
    ],
    reputation: {
      reviewsReceivedCount: 19,
      rentalsCompletedCount: 15,
      overallRenterRating: 4.6,
      overallLenderRating: 4.6,
      renterReliabilityAvg: 4.5,
      renterCareAvg: 4.6,
      renterCommunicationAvg: 4.7,
      lenderAccuracyAvg: 4.6,
      lenderConditionAvg: 4.5,
      lenderCommunicationAvg: 4.7,
      updatedAt: now,
    },
  },

  'demo-user-8': {
    id: 'demo-user-8',
    firstName: 'Aisha',
    lastName: 'Mohamed',
    avatarUrl: avatar('Aisha Mohamed'),
    bio: 'New here. Renting out a projector and a few kitchen things from my apartment.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2026-04-15T17:05:00.000Z',
    spotlightTags: ['New lender', 'Movie nights', 'Westdale'],
    reviewHighlights: [],
    reputation: {
      reviewsReceivedCount: 2,
      rentalsCompletedCount: 2,
      overallRenterRating: 4.5,
      overallLenderRating: 5,
      renterReliabilityAvg: 4.5,
      renterCareAvg: 4.5,
      renterCommunicationAvg: 4.5,
      lenderAccuracyAvg: 5,
      lenderConditionAvg: 5,
      lenderCommunicationAvg: 5,
      updatedAt: now,
    },
  },

  'demo-user-9': {
    id: 'demo-user-9',
    firstName: 'Ethan',
    lastName: 'Wright',
    avatarUrl: avatar('Ethan Wright'),
    bio: 'Eng student. Power tools, a heat gun, and a label maker that everyone somehow needs.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2025-08-27T13:10:00.000Z',
    spotlightTags: ['Maker', 'Waterloo', 'Detailed handoffs'],
    reviewHighlights: [
      {
        id: 'ethan-highlight-1',
        quote: 'Took photos of every scratch at pickup so we were both covered. Very fair.',
        label: 'Most common praise',
      },
    ],
    reputation: {
      reviewsReceivedCount: 27,
      rentalsCompletedCount: 20,
      overallRenterRating: 4.4,
      overallLenderRating: 4.7,
      renterReliabilityAvg: 4.3,
      renterCareAvg: 4.5,
      renterCommunicationAvg: 4.4,
      lenderAccuracyAvg: 4.8,
      lenderConditionAvg: 4.7,
      lenderCommunicationAvg: 4.6,
      updatedAt: now,
    },
  },

  'demo-user-10': {
    id: 'demo-user-10',
    firstName: 'Chloe',
    lastName: 'Tremblay',
    avatarUrl: avatar('Chloe Tremblay'),
    bio: 'Just joined. Listing my old DSLR and a tripod to see how this goes.',
    verificationStatus: 'VERIFIED',
    verifiedAt: now,
    createdAt: '2026-05-02T19:40:00.000Z',
    spotlightTags: ['Just joined'],
    reviewHighlights: [],
    reputation: null,
  },
}

// Back-compat alias — earlier code imported `publicProfiles`.
export const publicProfiles = DEMO_PUBLIC_PROFILES

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

export async function mockUpdateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  demoProfile.notificationPreferences = { ...demoProfile.notificationPreferences, ...patch }
  return demoProfile.notificationPreferences
}

export async function mockDeleteMyAccount(): Promise<void> {
  // Demo mode has no persistent account to scrub — the caller still logs out.
}
