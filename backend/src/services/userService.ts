import { randomBytes } from 'crypto'
import type { MyProfileResponse, NotificationPreferences, PublicProfileResponse } from '@zoink/shared'
import prisma from '../utils/prisma'
import { NotFoundError } from '../utils/errors'

const NOTIFICATION_PREF_COLUMNS = [
  'notifyMessages',
  'notifyBookingActivity',
  'notifyPaymentsPayouts',
  'notifyDepositUpdates',
  'notifyReviews',
] as const satisfies readonly (keyof NotificationPreferences)[]

function pickNotificationPreferences(row: NotificationPreferences): NotificationPreferences {
  return {
    notifyMessages: row.notifyMessages,
    notifyBookingActivity: row.notifyBookingActivity,
    notifyPaymentsPayouts: row.notifyPaymentsPayouts,
    notifyDepositUpdates: row.notifyDepositUpdates,
    notifyReviews: row.notifyReviews,
  }
}

function toNumber(value: unknown) {
  return value == null ? null : Number(value)
}

// ── Own profile ───────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<MyProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      bio: true,
      verificationStatus: true,
      verifiedAt: true,
      createdAt: true,
      notifyMessages: true,
      notifyBookingActivity: true,
      notifyPaymentsPayouts: true,
      notifyDepositUpdates: true,
      notifyReviews: true,
    },
  })
  if (!user) throw new NotFoundError('User not found.')
  return {
    ...user,
    verifiedAt: user.verifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    notificationPreferences: pickNotificationPreferences(user),
  }
}

// ── Notification preferences ─────────────────────────────────────────────────

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const data = Object.fromEntries(
    NOTIFICATION_PREF_COLUMNS.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]),
  )

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      notifyMessages: true,
      notifyBookingActivity: true,
      notifyPaymentsPayouts: true,
      notifyDepositUpdates: true,
      notifyReviews: true,
    },
  })
  return pickNotificationPreferences(user)
}

// ── Account deletion (soft-delete + anonymize) ──────────────────────────────

// Scrubs PII off the User row and marks it deleted, without cascading into
// Booking/Review/Dispute/Report — those stay intact for the other party's
// transaction history, now pointing at an anonymized row. The user's listings
// are pulled from circulation. Idempotent: a second call on an already-deleted
// row is a no-op.
export async function deleteMe(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  })
  if (!user) throw new NotFoundError('User not found.')
  if (user.deletedAt) return

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        firstName: 'Deleted',
        lastName: 'User',
        phone: '',
        avatarUrl: null,
        bio: null,
        // Tombstone address — unique, non-reusable, frees the original email
        // for re-registration.
        email: `deleted+${userId}@deleted.zoink.app`,
        // Random, unrecoverable — no password can ever match it again.
        passwordHash: randomBytes(48).toString('hex'),
        expoPushToken: null,
        deletedAt: new Date(),
      },
    }),
    prisma.listing.updateMany({
      where: { ownerId: userId },
      data: { isAvailable: false },
    }),
  ])
}

// ── Public profile (safe fields only — no email, no phone) ───────────────────

export async function getPublicProfile(userId: string): Promise<PublicProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      bio: true,
      verificationStatus: true,
      verifiedAt: true,
      createdAt: true,
      reputation: {
        select: {
          reviewsReceivedCount: true,
          rentalsCompletedCount: true,
          overallRenterRating: true,
          overallLenderRating: true,
          renterReliabilityAvg: true,
          renterCareAvg: true,
          renterCommunicationAvg: true,
          lenderAccuracyAvg: true,
          lenderConditionAvg: true,
          lenderCommunicationAvg: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!user) throw new NotFoundError('User not found.')
  return {
    ...user,
    verifiedAt: user.verifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    reputation: user.reputation
      ? {
        ...user.reputation,
        overallRenterRating: toNumber(user.reputation.overallRenterRating),
        overallLenderRating: toNumber(user.reputation.overallLenderRating),
        renterReliabilityAvg: toNumber(user.reputation.renterReliabilityAvg),
        renterCareAvg: toNumber(user.reputation.renterCareAvg),
        renterCommunicationAvg: toNumber(user.reputation.renterCommunicationAvg),
        lenderAccuracyAvg: toNumber(user.reputation.lenderAccuracyAvg),
        lenderConditionAvg: toNumber(user.reputation.lenderConditionAvg),
        lenderCommunicationAvg: toNumber(user.reputation.lenderCommunicationAvg),
        updatedAt: user.reputation.updatedAt.toISOString(),
      }
      : null,
  }
}

// ── Update own profile ────────────────────────────────────────────────────────

type UpdateMeInput = {
  firstName?: string
  lastName?: string
  phone?: string
  bio?: string
}

export async function updateMe(userId: string, data: UpdateMeInput) {
  // Strip undefined fields so Prisma only updates what was sent
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  )

  const user = await prisma.user.update({
    where: { id: userId },
    data: cleaned,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      bio: true,
      verificationStatus: true,
    },
  })
  return user
}

// ── Update avatar URL ─────────────────────────────────────────────────────────

export async function updateAvatar(userId: string, avatarUrl: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: { id: true, avatarUrl: true },
  })
  return user
}

// ── Update Expo push token ───────────────────────────────────────────────────

export async function updateExpoPushToken(userId: string, expoPushToken: string | null) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { expoPushToken },
    select: { id: true, expoPushToken: true },
  })
  return user
}

// ── Stripe Connect ────────────────────────────────────────────────────────────

export async function getStripeAccountId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeAccountId: true },
  })
  return user?.stripeAccountId ?? null
}

export async function updateStripeAccountId(userId: string, stripeAccountId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { stripeAccountId },
  })
}
