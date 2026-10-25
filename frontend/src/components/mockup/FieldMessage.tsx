import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { colors } from '../../theme/colors'
import { type } from '../../theme/typography'

/**
 * A validation message under a group that isn't a TextField (chips, ratings,
 * photos). Its line is always there, empty or not, so a message appearing
 * doesn't move the form (TextField's `validated` does the same for fields).
 */
export default function FieldMessage({ message, lines = 1 }: { message?: string; lines?: 1 | 2 }) {
  return (
    <Text style={[styles.message, { minHeight: type.caption.lineHeight * lines }]} numberOfLines={lines}>
      {message ?? ''}
    </Text>
  )
}

const styles = StyleSheet.create({
  message: {
    ...type.caption,
    color: colors.danger,
  },
})
