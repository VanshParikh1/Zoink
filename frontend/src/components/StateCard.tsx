import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
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
  const [isPressed, setIsPressed] = useState(false)

  return (
    <View style={[styles.cardContainer, isError && styles.cardError]}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 22,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardError: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSurface,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '500',
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
    fontWeight: '500',
    marginBottom: 8,
  },
  body: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '300',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  primaryButton: {
    backgroundColor: theme.primarySurface,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.borderFocus,
    borderTopColor: 'rgba(22, 255, 110, 0.4)',
  },
  primaryButtonPressed: {
    backgroundColor: 'rgba(22, 255, 110, 0.25)',
  },
  primaryButtonError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  primaryButtonText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
})

