import type { BlockedUser } from '../types'
import { publicProfiles } from './mockProfiles'

// DEMO_MODE stand-in for the user_blocks table. The listing, profile and
// conversation mocks all consult isDemoBlocked() so blocking behaves like the
// real backend: the other user's listings, profile and threads disappear.
let blocks: BlockedUser[] = []

export function isDemoBlocked(userId: string) {
  return blocks.some((block) => block.id === userId)
}

export async function mockBlockUser(userId: string): Promise<void> {
  if (isDemoBlocked(userId)) return
  const profile = publicProfiles[userId]
  blocks = [
    {
      id: userId,
      firstName: profile?.firstName ?? 'Zoink',
      lastName: profile?.lastName ?? 'User',
      avatarUrl: profile?.avatarUrl ?? null,
      blockedAt: new Date().toISOString(),
    },
    ...blocks,
  ]
}

export async function mockUnblockUser(userId: string): Promise<void> {
  blocks = blocks.filter((block) => block.id !== userId)
}

export async function mockGetMyBlocks(): Promise<BlockedUser[]> {
  return blocks
}
