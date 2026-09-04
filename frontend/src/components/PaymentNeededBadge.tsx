import React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'
import { theme } from '../theme/colors'

type Props = {
  onPress: () => void
}

// Tap target linking a conversation to its ACCEPTED-unpaid booking's Pay
// screen. Distinct from the unread-dot pattern on purpose — it must stay
// visible regardless of read/unread state, since "you owe money" doesn't
// stop being true just because you opened the thread.
export default function PaymentNeededBadge({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.badge} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <Text style={styles.text}>Payment needed</Text>
    </TouchableOpacity>
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
