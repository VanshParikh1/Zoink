import prisma from '../utils/prisma'
import { NotFoundError } from '../utils/errors'

function toNumber(value: unknown) {
  return value == null ? null : Number(value)
}

// ── Own profile ───────────────────────────────────────────────────────────────

export async function getMe(userId: string) {
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
    },
  })
  if (!user) throw new NotFoundError('User not found.')
  return user
}

// ── Public profile (safe fields only — no email, no phone) ───────────────────

export async function getPublicProfile(userId: string) {
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
