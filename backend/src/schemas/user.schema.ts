import { z } from 'zod'

/**
 * User-domain request schemas.
 *
 * Phone format is checked in userService.updateMe (same rule as sign-up), so
 * the app gets a readable message; the schema only bounds its length.
 */

// ── PATCH /users/me ───────────────────────────────────────────────────────────

export const UpdateMeSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50, 'firstName cannot exceed 50 characters.').optional(),
    lastName: z.string().min(1).max(50, 'lastName cannot exceed 50 characters.').optional(),
    phone: z.string().max(30, 'phone cannot exceed 30 characters.').optional(),
    bio: z.string().max(300, 'bio cannot exceed 300 characters.').optional(),
  }),
})

// ── PATCH /users/me/notification-prefs ───────────────────────────────────────

export const UpdateNotificationPrefsSchema = z.object({
  body: z
    .object({
      notifyMessages: z.boolean().optional(),
      notifyBookingActivity: z.boolean().optional(),
      notifyPaymentsPayouts: z.boolean().optional(),
      notifyDepositUpdates: z.boolean().optional(),
      notifyReviews: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one preference must be provided.',
    }),
})

// ── POST/DELETE /users/:id/block ─────────────────────────────────────────────

export const UserIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
})

// ── PATCH /users/me/push-token ────────────────────────────────────────────────

export const UpdatePushTokenSchema = z.object({
  body: z.object({
    // An Expo push token (e.g. "ExponentPushToken[...]"), or null to clear it.
    expoPushToken: z.string().max(200, 'expoPushToken is too long.').nullable().optional(),
  }),
})

// ── POST /users/me/push-token/release ────────────────────────────────────────

export const ReleasePushTokenSchema = z.object({
  body: z.object({
    // This phone's Expo push token; cleared only while the account still has it.
    expoPushToken: z.string().min(1).max(200, 'expoPushToken is too long.'),
  }),
})
