import { NotificationType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { Sentry } from '../instrument'
import { redactText } from '@zoink/shared'
import { loggableError } from '../utils/sentryScrub'

type NotifyInput = {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
}

// Per-category user toggles (see User.notify* columns). A null category means
// the notification is account-critical and always sent regardless of prefs.
const PREF_COLUMN_BY_TYPE: Partial<Record<NotificationType, keyof NotificationPrefs>> = {
  MESSAGE_RECEIVED: 'notifyMessages',
  BOOKING_REQUEST: 'notifyBookingActivity',
  BOOKING_ACCEPTED: 'notifyBookingActivity',
  BOOKING_DECLINED: 'notifyBookingActivity',
  BOOKING_CANCELLED: 'notifyBookingActivity',
  PAYMENT_RECEIVED: 'notifyPaymentsPayouts',
  PAYOUT_SENT: 'notifyPaymentsPayouts',
  DEPOSIT_RELEASED: 'notifyDepositUpdates',
  REVIEW_RECEIVED: 'notifyReviews',
  // VERIFICATION_APPROVED / VERIFICATION_FAILED: intentionally absent — no toggle.
}

type NotificationPrefs = {
  notifyMessages: boolean
  notifyBookingActivity: boolean
  notifyPaymentsPayouts: boolean
  notifyDepositUpdates: boolean
  notifyReviews: boolean
}

export function userWantsNotification(prefs: NotificationPrefs, type: NotificationType) {
  const column = PREF_COLUMN_BY_TYPE[type]
  return column ? prefs[column] : true
}

function getExpoAccessToken() {
  return process.env.EXPO_ACCESS_TOKEN?.trim() || ''
}

function isExpoPushToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[')
}

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    const accessToken = getExpoAccessToken()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        data,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn(`[Push] Expo send failed (${response.status}): ${redactText(text)}`)
    }
  } catch (error) {
    console.warn('[Push] Failed to send Expo notification:', loggableError(error))
  }
}

export async function createNotification(input: NotifyInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}

// Callers fire this after their own work has committed (`void notifyUser(...)`),
// so it must never reject: an unhandled rejection can take the process down.
// A failed notification is logged and reported, and the caller carries on.
export async function notifyUser(input: NotifyInput) {
  try {
    await deliverNotification(input)
  } catch (error) {
    console.error(`[notifyUser] ${input.type} for user ${input.userId} failed:`, loggableError(error))
    Sentry.captureException(error, { tags: { notificationType: input.type } })
  }
}

async function deliverNotification(input: NotifyInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      expoPushToken: true,
      notifyMessages: true,
      notifyBookingActivity: true,
      notifyPaymentsPayouts: true,
      notifyDepositUpdates: true,
      notifyReviews: true,
    },
  })

  // The recipient can be gone by the time this runs (e.g. account deleted).
  if (!user) return

  // A category the user has switched off suppresses both the DB row and the
  // push — not just the push.
  if (!userWantsNotification(user, input.type)) {
    return
  }

  await createNotification(input)

  if (isExpoPushToken(user.expoPushToken)) {
    await sendExpoPush(user.expoPushToken, input.title, input.body, input.data)
  }
}
