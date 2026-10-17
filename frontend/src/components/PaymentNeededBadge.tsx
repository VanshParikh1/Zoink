import React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'
import { colors } from '../theme/colors'
import { border, radius } from '../theme/tokens'
import { type } from '../theme/typography'

type Props = {
  onPress: () => void
}

// Tap target linking a conversation to its ACCEPTED-unpaid booking's Pay
// screen. Distinct from the unread-dot pattern on purpose — it must stay
// visible regardless of read/unread state, since "you owe money" doesn't
// stop being true just because you opened the thread.
export default function PaymentNeededBadge({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.badge}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Payment needed. Pay now"
    >
      <Text style={styles.text}>Payment needed</Text>
    </TouchableOpacity>
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
