import React from 'react'
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius, shadow, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import { fillImageUrl } from '../../utils/cloudinaryImage'
import { categoryAbbreviation } from '../../config/categories'
import HardShadow from './HardShadow'
import Badge, { BadgeVariant } from './Badge'
import { listingDisplay, ListingCardData } from './listingFormat'

const SHADOW = shadow.md
const TITLE_LINE_HEIGHT = 19
const TITLE_LINES = 2

type Props = {
  listing: ListingCardData
  /** Total width of the grid cell, hard shadow included. */
  width: number
  /** Replaces the deposit badge on the photo (e.g. a listing status). */
  badge?: { label: string; variant: BadgeVariant }
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

/** Vertical listing card for grids and carousels: square photo, two-line title, price. */
function ListingGridCard({ listing, width, badge, onPress, style }: Props) {
  const { priceLine, deposit, imageUrl, accessibilityLabel } = listingDisplay(listing)
  // The shadow sits in HardShadow's right/bottom padding, so the card itself
  // is the cell width minus the offset.
  const cardWidth = width - SHADOW
  const imageSide = cardWidth - border.base * 2

  return (
    <HardShadow
      pressable
      onPress={onPress}
      offset={SHADOW}
      radius={radius.cardLg}
      style={[{ width }, style]}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${accessibilityLabel}, ${badge.label}` : accessibilityLabel}
    >
      <View style={styles.card}>
        <View style={[styles.imageBox, { height: imageSide + border.base }]}>
          {imageUrl ? (
            <Image
              source={{ uri: fillImageUrl(imageUrl, { width: imageSide, height: imageSide }) }}
              // Explicit size: an absolute-fill Image didn't draw inside Thumb on iOS.
              style={[styles.image, { width: imageSide, height: imageSide }]}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.fallbackTag}>{categoryAbbreviation(listing.category)}</Text>
          )}
          {badge ? (
            <Badge label={badge.label} variant={badge.variant} style={styles.depositBadge} />
          ) : deposit ? (
            <Badge label={deposit} variant="lime" style={styles.depositBadge} />
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={TITLE_LINES}>
            {listing.title}
          </Text>
          <Text style={type.price} numberOfLines={1}>
            {priceLine}
          </Text>
        </View>
      </View>
    </HardShadow>
  )
}

/** Same shape as the card, for loading states. */
function ListingGridCardSkeleton({ width, style }: { width: number; style?: StyleProp<ViewStyle> }) {
  const imageSide = width - SHADOW - border.base * 2
  return (
    <HardShadow offset={SHADOW} radius={radius.cardLg} style={[{ width }, style]}>
      <View style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.imageBox, { height: imageSide + border.base }]} />
        <View style={styles.body}>
          <View style={styles.titleSkeleton}>
            <View style={[styles.bar, styles.barLong]} />
          </View>
          <View style={[styles.bar, styles.barShort]} />
        </View>
      </View>
    </HardShadow>
  )
}

ListingGridCard.Skeleton = ListingGridCardSkeleton

export default ListingGridCard

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.base,
    borderColor: colors.ink,
    borderRadius: radius.cardLg,
    // Clips the photo to the rounded corners; on the card, not on HardShadow,
    // so the shadow behind it isn't clipped.
    overflow: 'hidden',
  },
  imageBox: {
    backgroundColor: colors.tan,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fallbackTag: {
    fontFamily: fonts.black,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  depositBadge: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
  },
  body: {
    padding: space.md,
    gap: 3,
  },
  title: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    lineHeight: TITLE_LINE_HEIGHT,
    // Always two lines tall, so every card in a row has the same height.
    height: TITLE_LINE_HEIGHT * TITLE_LINES,
    color: colors.ink,
  },
  titleSkeleton: {
    height: TITLE_LINE_HEIGHT * TITLE_LINES,
    justifyContent: 'center',
  },
  bar: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.tan,
  },
  barLong: {
    width: '80%',
  },
  barShort: {
    width: '45%',
  },
})
