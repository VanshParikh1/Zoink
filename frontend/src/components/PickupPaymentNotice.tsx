import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'

/** The same sentence the server answers with when it refuses the pickup
 *  (backend handoffService PickupPaymentRequiredError). */
export const PICKUP_PAYMENT_REQUIRED = "Payment hasn't gone through. The renter needs to pay before pickup."

type Props = {
  style?: ViewStyle
}

// Shown in place of the pickup handoff while the booking's payment isn't in
// place (isPickupPaymentReady in @zoink/shared): the rent or deposit hold
// hasn't been authorized, or was cancelled or failed after the renter paid.
export default function PickupPaymentNotice({ style }: Props) {
  return (
    <View style={[styles.notice, style]} accessibilityRole="alert">
      <Feather name="alert-triangle" size={18} color={colors.ink} />
      <Text style={styles.text}>{PICKUP_PAYMENT_REQUIRED}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.warning,
    borderRadius: radius.card,
    borderWidth: border.thin,
    borderColor: colors.ink,
    padding: space.lg,
  },
  text: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    flex: 1,
  },
})
