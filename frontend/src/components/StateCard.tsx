import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { theme } from '../theme/colors'
import HardBlock from './HardBlock'

type Tone = 'default' | 'error'

type Props = {
  eyebrow?: string
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  tone?: Tone
}

export default function StateCard({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tone = 'default',
}: Props) {
  const isError = tone === 'error'
  const [isPressed, setIsPressed] = useState(false)

  return (
    <HardBlock
      radius={theme.radius.sm}
      offset={theme.hard.offset.md}
      backgroundColor={isError ? theme.colors.dangerSurface : theme.cardBackground}
      borderColor={isError ? theme.colors.danger : theme.hard.ink}
      style={styles.wrap}
      contentStyle={styles.cardContainer}
    >
      {eyebrow ? <Text style={[styles.eyebrow, isError && styles.eyebrowError]}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            style={[
              styles.primaryButton,
              isError && styles.primaryButtonError,
              isPressed && styles.primaryButtonPressed
            ]}
            onPress={onAction}
          >
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </TouchableOpacity>

          {secondaryActionLabel && onSecondaryAction ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryAction}>
              <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </HardBlock>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  cardContainer: {
    padding: 22,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  eyebrowError: {
    color: theme.colors.danger,
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  body: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  primaryButton: {
    backgroundColor: theme.primarySurface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  primaryButtonPressed: {
    backgroundColor: theme.primaryLight,
  },
  primaryButtonError: {
    backgroundColor: theme.colors.dangerSurface,
    borderColor: theme.colors.danger,
  },
  primaryButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
})
