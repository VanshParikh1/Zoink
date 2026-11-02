import React, { forwardRef } from 'react'
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'

/**
 * What the field holds: sets the keyboard, autocorrect and capitalisation,
 * and the autofill hints (iOS textContentType, Android autoComplete). Any of
 * those passed as props still win.
 */
export type FieldKind = 'email' | 'password' | 'newPassword' | 'givenName' | 'familyName' | 'phone' | 'money' | 'city'

const KINDS: Record<FieldKind, Partial<TextInputProps>> = {
  email: { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, spellCheck: false, textContentType: 'emailAddress', autoComplete: 'email' },
  password: { secureTextEntry: true, autoCapitalize: 'none', autoCorrect: false, textContentType: 'password', autoComplete: 'current-password' },
  newPassword: { secureTextEntry: true, autoCapitalize: 'none', autoCorrect: false, textContentType: 'newPassword', autoComplete: 'new-password' },
  givenName: { autoCapitalize: 'words', autoCorrect: false, textContentType: 'givenName', autoComplete: 'given-name' },
  familyName: { autoCapitalize: 'words', autoCorrect: false, textContentType: 'familyName', autoComplete: 'family-name' },
  phone: { keyboardType: 'phone-pad', autoCorrect: false, textContentType: 'telephoneNumber', autoComplete: 'tel' },
  money: { keyboardType: 'decimal-pad', autoCorrect: false },
  city: { autoCapitalize: 'words', autoCorrect: false, textContentType: 'addressCity', autoComplete: 'postal-address-locality' },
}

type Props = Omit<TextInputProps, 'style'> & {
  label?: string
  leftIcon?: React.ReactNode
  /** Trailing element inside the field, e.g. a clear button. */
  rightAccessory?: React.ReactNode
  error?: string
  /**
   * Reserves room under the field for its validation message (this many
   * lines), so a message appearing or clearing doesn't move the form.
   */
  validated?: boolean | 1 | 2
  kind?: FieldKind
  /** Short numeric fields: radius 14 and bold text. */
  variant?: 'pill' | 'boxed'
  style?: StyleProp<ViewStyle>
}

const ERROR_LINE = type.caption.lineHeight

const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, leftIcon, rightAccessory, error, validated, kind, variant = 'pill', style, ...inputProps },
  ref
) {
  const boxed = variant === 'boxed'
  const multiline = !!inputProps.multiline
  const reservedLines = validated === true ? 1 : validated || 0
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
          {...(kind ? KINDS[kind] : null)}
          {...inputProps}
          style={[styles.input, boxed ? styles.inputBoxed : null, multiline ? styles.inputMultiline : null]}
        />
        {rightAccessory}
      </View>
      {reservedLines > 0 ? (
        <Text style={[styles.error, { minHeight: ERROR_LINE * reservedLines }]} numberOfLines={reservedLines}>
          {error ?? ''}
        </Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
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
