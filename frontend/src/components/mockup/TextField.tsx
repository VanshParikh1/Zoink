import React, { forwardRef } from 'react'
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'

type Props = Omit<TextInputProps, 'style'> & {
  label?: string
  leftIcon?: React.ReactNode
  /** Trailing element inside the field, e.g. a clear button. */
  rightAccessory?: React.ReactNode
  error?: string
  /** Short numeric fields: radius 14 and bold text. */
  variant?: 'pill' | 'boxed'
  style?: StyleProp<ViewStyle>
}

const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, leftIcon, rightAccessory, error, variant = 'pill', style, ...inputProps },
  ref
) {
  const boxed = variant === 'boxed'
  const multiline = !!inputProps.multiline
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, boxed ? styles.boxed : null, multiline ? styles.fieldMultiline : null, error ? styles.fieldError : null]}>
        {leftIcon}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedAlt}
          selectionColor={colors.greenText}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          {...inputProps}
          style={[styles.input, boxed ? styles.inputBoxed : null, multiline ? styles.inputMultiline : null]}
        />
        {rightAccessory}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
})

export default TextField

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    ...type.labelSm,
    color: colors.ink,
  },
  field: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: border.base,
    borderColor: colors.ink,
  },
  boxed: {
    borderRadius: radius.thumb,
    paddingHorizontal: 14,
  },
  // Multiline: grows with the text, card radius instead of a pill.
  fieldMultiline: {
    height: undefined,
    minHeight: 110,
    alignItems: 'flex-start',
    borderRadius: radius.card,
    paddingVertical: 12,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    height: '100%',
    // No lineHeight on TextInput: it misaligns the caret on iOS.
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  inputMultiline: {
    height: undefined,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inputBoxed: {
    fontFamily: fonts.bold,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
})
