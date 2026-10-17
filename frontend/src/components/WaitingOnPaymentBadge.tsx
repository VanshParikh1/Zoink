import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../theme/colors'
import { border, radius } from '../theme/tokens'
import { type } from '../theme/typography'

type Props = {
  style?: ViewStyle
}

// Lender-side counterpart to PaymentNeededBadge. Same visual weight, but not a
// tap target — the owner has nothing to do here except wait for the renter to
// pay the accepted booking. Stays visible regardless of read/unread state,
// same reasoning as PaymentNeededBadge.
export default function WaitingOnPaymentBadge({ style }: Props) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>Waiting on payment</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    borderWidth: border.thin,
    borderColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: {
    ...type.eyebrow,
    color: colors.ink,
  },
})
