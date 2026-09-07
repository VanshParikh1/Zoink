import React from 'react'
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { theme } from '../theme/colors'

type Props = {
  // Defaults to navigation.goBack(). Pass a custom handler for screens that
  // need to do extra work first (haptics, cancelling an edit, etc.).
  onPress?: () => void
  disabled?: boolean
  // Extra layout-only styling for the call site — most screens use this to
  // add the bottom margin that separates the button from the title below it.
  style?: ViewStyle
  accessibilityLabel?: string
}

// The one back control for the whole app — a 36pt circular button with the
// neobrutalist ink outline, matching the header back button on the messages
// (ConversationThread) screen. Every screen's back affordance should be this.
export default function BackButton({
  onPress,
  disabled = false,
  style,
  accessibilityLabel = 'Go back',
}: Props) {
  const navigation = useNavigation()

  return (
    <TouchableOpacity
      style={[styles.backButton, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress ?? (() => navigation.goBack())}
    >
      <Feather name="arrow-left" size={20} color={theme.hard.ink} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  disabled: { opacity: 0.4 },
})
