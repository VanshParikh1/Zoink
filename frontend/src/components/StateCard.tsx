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

  const renderContent = () => (
    <>
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
    </>
  )

  return (
    <View style={[styles.cardContainer, isError && styles.cardError]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={50} style={styles.blurCard} tint="dark">
          {renderContent()}
        </BlurView>
      ) : (
        <View style={styles.androidCard}>
          {renderContent()}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    borderTopColor: theme.glassHighlight,
    borderBottomColor: theme.glassBorderBottom,
    overflow: 'hidden',
    marginBottom: 16,
    // Soft glass shadow
    shadowColor: theme.glassShadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardError: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  blurCard: {
    padding: 22,
    backgroundColor: theme.glassFill,
  },
  androidCard: {
    padding: 22,
    backgroundColor: 'rgba(10, 46, 22, 0.85)',
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
    backgroundColor: theme.glassPrimaryFill,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.glassPrimaryBorder,
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
    borderColor: theme.glassBorder,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
})
