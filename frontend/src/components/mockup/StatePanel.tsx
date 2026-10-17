import React from 'react'
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import { type } from '../../theme/typography'
import Card from './Card'
import Button, { ButtonVariant } from './Button'

type Props = {
  title: string
  body: string
  /** Empty states use a secondary button, errors a primary one (retry). */
  action?: { label: string; onPress: () => void; variant?: ButtonVariant }
  style?: StyleProp<ViewStyle>
}

/** Empty / error panel: a flat card with a title, muted body and at most one action. */
export default function StatePanel({ title, body, action, style }: Props) {
  return (
    <Card shadow={false} style={style} contentStyle={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} style={styles.action} />
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
  },
  title: {
    ...type.section,
    color: colors.ink,
  },
  body: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  action: {
    marginTop: space.sm,
  },
})
