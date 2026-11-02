import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import { fillImageUrl } from '../../utils/cloudinaryImage'
import { categoryAbbreviation } from '../../config/categories'
import HardShadow from './HardShadow'
import Thumb from './Thumb'
import Badge, { BadgeVariant } from './Badge'
import { listingDisplay, ListingCardData } from './listingFormat'

const THUMB = 62

type Props = {
  listing: ListingCardData
  /** Replaces the price line (e.g. rental dates). */
  subtitle?: string
  /** Replaces the deposit badge (e.g. a booking status). */
  badge?: { label: string; variant: BadgeVariant }
  /** Muted line between the title and the price line (e.g. renter and dates). */
  caption?: string
  /** Under the row, inside the card (e.g. inline actions). */
  children?: React.ReactNode
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

/** One listing row: photo, title, price (and distance when the data has it), deposit badge. */
export default function ListingCard({ listing, subtitle, badge, caption, children, onPress, style }: Props) {
  const { priceLine, deposit, imageUrl, accessibilityLabel } = listingDisplay(listing)

  return (
    <HardShadow
      pressable
      onPress={onPress}
      offset="md"
      radius={radius.cardLg}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={subtitle || badge || caption ? [listing.title, caption, subtitle, badge?.label].filter(Boolean).join(', ') : accessibilityLabel}
    >
      <View style={[styles.card, children ? styles.cardWithFooter : null]}>
        <View style={styles.row}>
          <Thumb
            size={THUMB}
            source={imageUrl ? { uri: fillImageUrl(imageUrl, { width: THUMB, height: THUMB }) } : undefined}
            initials={categoryAbbreviation(listing.category)}
            initialsSize={17}
          />
          <View style={styles.middle}>
            <Text style={styles.title} numberOfLines={1}>
              {listing.title}
            </Text>
            {caption ? (
              <Text style={styles.caption} numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
            <Text style={type.price} numberOfLines={1}>
              {subtitle ?? priceLine}
            </Text>
          </View>
          {badge ? <Badge label={badge.label} variant={badge.variant} /> : deposit ? <Badge label={deposit} variant="lime" /> : null}
        </View>
        {children}
      </View>
    </HardShadow>
  )
}

/** Placeholder with the card's shape while listings load. */
export function ListingCardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <HardShadow offset="md" radius={radius.cardLg} style={style}>
      <View style={[styles.card, styles.row]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.skeletonThumb} />
        <View style={styles.middle}>
          <View style={[styles.skeletonLine, styles.skeletonTitle]} />
          <View style={[styles.skeletonLine, styles.skeletonPrice]} />
        </View>
      </View>
    </HardShadow>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radius.cardLg,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  cardWithFooter: {
    gap: space.md,
  },
  middle: {
    flex: 1,
    gap: 4,
  },
  caption: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  title: {
    ...type.body,
    fontFamily: fonts.bold,
    lineHeight: 20,
    color: colors.ink,
  },
  skeletonThumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.thumb,
    backgroundColor: colors.tan,
  },
  skeletonLine: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.tan,
  },
  skeletonTitle: {
    width: '70%',
  },
  skeletonPrice: {
    width: '40%',
  },
})
