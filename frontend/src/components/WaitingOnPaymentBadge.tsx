import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { theme } from '../theme/colors'

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
    backgroundColor: theme.warningSurface,
    borderRadius: theme.radius.pill,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    color: theme.warning,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
})
