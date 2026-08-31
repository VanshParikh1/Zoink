import React from 'react'
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native'
import { theme } from '../theme/colors'

type Props = {
  avgRating: number | null
  reviewCount: number
  style?: StyleProp<ViewStyle>
}

// Read-only item-rating display for listing cards and the listing detail
// screen. Sourced from the denormalized Listing.avgRating / reviewCount
// rollup (see backend reviewService.recomputeListingRating). Neobrutalist
// pill matched to the landing page's `.rating` chip.
//
// Format:
//   reviewCount > 0  ->  "★ 4.5 · 12"
//   reviewCount === 0 -> "No reviews yet"
// No threshold hiding — a single-review listing still shows its number.
export default function RatingPill({ avgRating, reviewCount, style }: Props) {
  const hasReviews = reviewCount > 0 && avgRating !== null

  return (
    <View style={[styles.pill, hasReviews ? styles.pillRated : styles.pillEmpty, style]}>
      <Text
        style={[styles.text, hasReviews ? styles.textRated : styles.textEmpty]}
        numberOfLines={1}
      >
        {hasReviews ? `★ ${avgRating!.toFixed(1)} · ${reviewCount}` : 'No reviews yet'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    borderWidth: theme.hard.borderThin,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillRated: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.hard.ink,
  },
  pillEmpty: {
    backgroundColor: theme.surfaceSubdued,
    borderColor: theme.border,
  },
  text: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  textRated: {
    color: theme.text,
  },
  textEmpty: {
    color: theme.textMuted,
  },
})
