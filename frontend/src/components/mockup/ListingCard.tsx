import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import { fillImageUrl } from '../../utils/cloudinaryImage'
import { categoryAbbreviation } from '../../config/categories'
import HardShadow from './HardShadow'
import Thumb from './Thumb'
import Badge from './Badge'
import { listingDisplay, ListingCardData } from './listingFormat'

const THUMB = 62

type Props = {
  listing: ListingCardData
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

/** One listing row: photo, title, price (and distance when the data has it), deposit badge. */
export default function ListingCard({ listing, onPress, style }: Props) {
  const { priceLine, deposit, imageUrl, accessibilityLabel } = listingDisplay(listing)

  return (
    <HardShadow
      pressable
      onPress={onPress}
      offset="md"
      radius={radius.cardLg}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.card}>
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
          <Text style={type.price} numberOfLines={1}>
            {priceLine}
          </Text>
        </View>
        {deposit ? <Badge label={deposit} variant="lime" /> : null}
      </View>
    </HardShadow>
  )
}

/** Placeholder with the card's shape while listings load. */
export function ListingCardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <HardShadow offset="md" radius={radius.cardLg} style={style}>
      <View style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.md,
    borderRadius: radius.cardLg,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  middle: {
    flex: 1,
    gap: 4,
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
