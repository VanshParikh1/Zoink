import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../theme/colors'
import { border, space } from '../../theme/tokens'
import { type } from '../../theme/typography'
import { PublicProfile, MyProfile } from '../../types'
import { fillImageUrl } from '../../utils/cloudinaryImage'
import { initialsOf } from '../../utils/initials'
import Card from './Card'
import HardShadow from './HardShadow'
import Thumb from './Thumb'

const AVATAR = 72

type Props = {
  profile: PublicProfile | MyProfile
  /** "UofT · Verified student" */
  caption: string
  /** Makes the avatar a button (photo upload) with an edit badge. */
  onAvatarPress?: () => void
  avatarBusy?: boolean
  /** Actions under the stats, e.g. an Edit button. */
  children?: React.ReactNode
}

/** Average of the lender and renter ratings that exist, one decimal. */
export function overallRating(profile: PublicProfile | MyProfile): string | null {
  const ratings = [profile.reputation?.overallLenderRating, profile.reputation?.overallRenterRating].filter(
    (value): value is number => value != null
  )
  if (ratings.length === 0) return null
  return (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
}

export default function ProfileHeader({ profile, caption, onAvatarPress, avatarBusy = false, children }: Props) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const rating = overallRating(profile)
  const stats = [
    { label: 'Rentals', value: String(profile.reputation?.rentalsCompletedCount ?? 0) },
    { label: 'Rating', value: rating ?? 'New' },
    { label: 'Reviews', value: String(profile.reputation?.reviewsReceivedCount ?? 0) },
  ]

  const avatar = (
    <HardShadow offset="sm" radius={AVATAR / 2}>
      <Thumb
        size={AVATAR}
        style={styles.avatar}
        initials={initialsOf(profile) || '?'}
        source={profile.avatarUrl ? { uri: fillImageUrl(profile.avatarUrl, { width: AVATAR * 2, height: AVATAR * 2 }) } : undefined}
      />
      {onAvatarPress ? (
        <View style={styles.editBadge}>
          {avatarBusy ? <ActivityIndicator size="small" color={colors.green} /> : <Feather name="edit-2" size={13} color={colors.green} />}
        </View>
      ) : null}
    </HardShadow>
  )

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        {onAvatarPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarBusy ? 'Uploading photo' : 'Change profile photo'}
            disabled={avatarBusy}
            onPress={onAvatarPress}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            {avatar}
          </Pressable>
        ) : (
          avatar
        )}
        <View style={styles.nameBlock}>
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      </View>

      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      <View style={styles.stats}>
        {stats.map((stat) => (
          <Card key={stat.label} shadow={false} padding={space.lg} style={styles.stat} contentStyle={styles.statBody}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Card>
        ))}
      </View>

      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xxl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxl,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: border.base,
    backgroundColor: colors.lime,
  },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  nameBlock: {
    flex: 1,
    gap: 4,
  },
  name: {
    ...type.h2,
    color: colors.ink,
  },
  caption: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  bio: {
    ...type.bodySm,
    color: colors.muted,
  },
  stats: {
    flexDirection: 'row',
    gap: space.md,
  },
  stat: {
    flex: 1,
  },
  statBody: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...type.section,
    color: colors.ink,
  },
  statLabel: {
    ...type.caption,
    color: colors.mutedAlt,
  },
})
