import React from 'react'
import { Image, StyleSheet, Text, View, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { MyProfile, PublicProfile, UserReputation } from '../types'
import { theme } from '../theme/colors'

type ProfileCardProps = {
  profile: PublicProfile | MyProfile
}

type BadgeTone = 'bright' | 'dark' | 'soft'

type Badge = {
  label: string
  tone: BadgeTone
}

function formatMemberSince(createdAt: string) {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

function average(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value != null)
  if (filtered.length === 0) return null
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1))
}

function buildBadges(profile: PublicProfile | MyProfile): Badge[] {
  const badges: Badge[] = []
  const reputation = profile.reputation

  if (!reputation) {
    badges.push({ label: 'Rookie member', tone: 'soft' })
    return badges
  }

  if (reputation.rentalsCompletedCount >= 15) {
    badges.push({ label: 'Campus regular', tone: 'dark' })
  } else if (reputation.rentalsCompletedCount >= 5) {
    badges.push({ label: 'Active renter', tone: 'soft' })
  }

  if ((reputation.overallLenderRating ?? 0) >= 4.8 && reputation.reviewsReceivedCount >= 5) {
    badges.push({ label: 'Trusted lender', tone: 'bright' })
  }

  if ((reputation.overallRenterRating ?? 0) >= 4.7 && reputation.reviewsReceivedCount >= 5) {
    badges.push({ label: 'Reliable borrower', tone: 'dark' })
  }

  if (reputation.reviewsReceivedCount >= 20) {
    badges.push({ label: 'Review legend', tone: 'soft' })
  }

  return badges.slice(0, 4)
}

function buildTier(reputation: UserReputation | null) {
  if (!reputation || reputation.reviewsReceivedCount === 0) return 'Rookie'

  const overall = average([reputation.overallLenderRating, reputation.overallRenterRating]) ?? 0

  if (reputation.rentalsCompletedCount >= 15 && overall >= 4.8) return 'Elite'
  if (reputation.rentalsCompletedCount >= 8 && overall >= 4.6) return 'Trusted'
  return 'Verified'
}

function scoreBar(value: number | null) {
  if (value == null) return 'New'
  return `${value.toFixed(1)} / 5`
}

function scoreWidth(value: number | null) {
  if (value == null) return '10%'
  return `${Math.max(10, Math.min(100, (value / 5) * 100))}%`
}

function RatingTrack({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  return (
    <View style={styles.track}>
      <View style={styles.trackHeader}>
        <Text style={styles.trackLabel}>{label}</Text>
        <Text style={styles.trackValue}>{scoreBar(value)}</Text>
      </View>
      <View style={styles.trackRail}>
        <View style={[styles.trackFill, { width: scoreWidth(value) as any }]} />
      </View>
    </View>
  )
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const fullName = `${profile.firstName} ${profile.lastName}`
  const reputation = profile.reputation
  const badges = buildBadges(profile)
  const tier = buildTier(reputation)
  const quote = profile.bio?.trim() || 'Building trust one smooth handoff at a time.'
  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.trim() || '?'
  const spotlightTags = profile.spotlightTags?.slice(0, 3) ?? []
  const reviewHighlights = profile.reviewHighlights?.slice(0, 2) ?? []

  return (
    <View style={styles.shell}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />

      {Platform.OS === 'ios' ? (
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(5, 30, 9, 0.4)' }]} />
      )}

      <View style={styles.topRow}>
        <View style={styles.tierChip}>
          <Text style={styles.tierChipText}>{tier}</Text>
        </View>
        <Text style={styles.memberSince}>Member since {formatMemberSince(profile.createdAt)}</Text>
      </View>

      <View style={styles.hero}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroFallbackText}>{initials}</Text>
          </View>
        )}
      </View>

      <View style={styles.nameRow}>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.handle}>Student marketplace regular</Text>
        </View>
        <View style={styles.statBubble}>
          <Text style={styles.statBubbleValue}>{reputation?.rentalsCompletedCount ?? 0}</Text>
          <Text style={styles.statBubbleLabel}>rentals</Text>
        </View>
      </View>

      <Text style={styles.quote}>"{quote}"</Text>

      {spotlightTags.length > 0 && (
        <View style={styles.tagRow}>
          {spotlightTags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.badgeRow}>
        {badges.map((badge) => (
          <View
            key={badge.label}
            style={[
              styles.badge,
              badge.tone === 'bright' && styles.badgeBright,
              badge.tone === 'dark' && styles.badgeDark,
              badge.tone === 'soft' && styles.badgeSoft,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                badge.tone === 'bright' && styles.badgeTextBright,
                badge.tone === 'dark' && styles.badgeTextDark,
              ]}
            >
              {badge.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Reviews</Text>
          <Text style={styles.statValue}>{reputation?.reviewsReceivedCount ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Lender</Text>
          <Text style={styles.statValue}>{reputation?.overallLenderRating?.toFixed(1) ?? 'New'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Borrower</Text>
          <Text style={styles.statValue}>{reputation?.overallRenterRating?.toFixed(1) ?? 'New'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>As a lender</Text>
        <RatingTrack label="Accuracy" value={reputation?.lenderAccuracyAvg ?? null} />
        <RatingTrack label="Condition" value={reputation?.lenderConditionAvg ?? null} />
        <RatingTrack label="Communication" value={reputation?.lenderCommunicationAvg ?? null} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>As a borrower</Text>
        <RatingTrack label="Reliability" value={reputation?.renterReliabilityAvg ?? null} />
        <RatingTrack label="Care" value={reputation?.renterCareAvg ?? null} />
        <RatingTrack label="Communication" value={reputation?.renterCommunicationAvg ?? null} />
      </View>

      {reviewHighlights.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>What people say</Text>
          {reviewHighlights.map((highlight) => (
            <View key={highlight.id} style={styles.highlightCard}>
              <Text style={styles.highlightQuote}>"{highlight.quote}"</Text>
              <Text style={styles.highlightLabel}>{highlight.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
  },
  glowA: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 255, 110, 0.12)',
  },
  glowB: {
    position: 'absolute',
    bottom: 120,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(240, 250, 242, 0.06)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  tierChip: {
    backgroundColor: theme.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tierChipText: {
    color: theme.textOnPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  memberSince: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: theme.surfaceSubdued,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroFallback: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#051E09',
  },
  heroFallbackText: {
    color: theme.primary,
    fontSize: 56,
    fontWeight: '900',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  nameBlock: { flex: 1 },
  name: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  handle: {
    marginTop: 6,
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  statBubble: {
    minWidth: 76,
    backgroundColor: 'rgba(15, 255, 80, 0.1)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 255, 80, 0.2)',
  },
  statBubbleValue: {
    color: theme.primaryDeep,
    fontSize: 24,
    fontWeight: '900',
  },
  statBubbleLabel: {
    color: 'rgba(5, 30, 9, 0.5)',
    fontSize: 12,
    fontWeight: '700',
  },
  quote: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.surfaceSubdued,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tagChipText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeBright: {
    backgroundColor: theme.primary,
  },
  badgeDark: {
    backgroundColor: theme.text,
  },
  badgeSoft: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.text,
  },
  badgeTextBright: {
    color: theme.textOnPrimary,
  },
  badgeTextDark: {
    color: theme.colors.inkBase,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  statLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  statValue: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  panelTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  track: {
    marginBottom: 12,
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  trackLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  trackValue: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  trackRail: {
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.inkBase,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.primary,
  },
  highlightCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  highlightQuote: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  highlightLabel: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
  },
})

