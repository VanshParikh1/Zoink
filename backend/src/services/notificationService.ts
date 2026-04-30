import { NotificationType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'

type NotifyInput = {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
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
      console.warn(`[Push] Expo send failed (${response.status}): ${text}`)
    }
  } catch (error) {
    console.warn('[Push] Failed to send Expo notification:', error)
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

export async function notifyUser(input: NotifyInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      expoPushToken: true,
    },
  })

  await createNotification(input)

  if (isExpoPushToken(user?.expoPushToken)) {
    await sendExpoPush(user.expoPushToken, input.title, input.body, input.data)
  }
}

export async function sendDirectPush(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      expoPushToken: true,
    },
  })

  if (isExpoPushToken(user?.expoPushToken)) {
    await sendExpoPush(user.expoPushToken, title, body, data)
  }
}
