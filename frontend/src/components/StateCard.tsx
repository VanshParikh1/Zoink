import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { theme } from '../theme/colors'

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

  return (
    <View style={[styles.card, isError && styles.cardError]}>
      {eyebrow ? <Text style={[styles.eyebrow, isError && styles.eyebrowError]}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.primaryButton, isError && styles.primaryButtonError]} onPress={onAction}>
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
          {secondaryActionLabel && onSecondaryAction ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryAction}>
              <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-start',
  },
  cardError: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 10,
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
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonError: {
    backgroundColor: theme.colors.danger,
  },
  primaryButtonText: {
    color: theme.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
})
