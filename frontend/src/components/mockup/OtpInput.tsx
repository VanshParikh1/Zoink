import React, { useRef, useState } from 'react'
import { Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { border, radius, shadow } from '../../theme/tokens'
import { fonts } from '../../theme/typography'
import HardShadow from './HardShadow'

const LENGTH = 6

type Props = {
  value: string
  onChange: (code: string) => void
  onComplete?: (code: string) => void
  autoFocus?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * One real TextInput drives six display boxes. The input is laid over the row
 * (transparent), so a tap focuses it and a long press opens the system Paste
 * menu; iOS also offers the emailed code above the keyboard (oneTimeCode).
 * Anything that isn't a digit is dropped, so pasting "123 456" works too.
 */
export default function OtpInput({ value, onChange, onComplete, autoFocus, style }: Props) {
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const current = Math.min(value.length, LENGTH - 1)

  const handleChange = (text: string) => {
    const code = text.replace(/\D/g, '').slice(0, LENGTH)
    onChange(code)
    if (code.length === LENGTH && value.length !== LENGTH) onComplete?.(code)
  }

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={[styles.row, style]} accessibilityRole="none">
      {Array.from({ length: LENGTH }, (_, i) => {
        const isCurrent = focused && i === current
        const box = (
          <View style={[styles.box, isCurrent ? styles.boxCurrent : null]}>
            <Text style={styles.digit}>{value[i] ?? ''}</Text>
          </View>
        )
        return (
          <View key={i} style={styles.slot}>
            {isCurrent ? (
              <HardShadow offset="xs" radius={radius.thumb}>
                {box}
              </HardShadow>
            ) : (
              // Same footprint as the shadowed box so the row doesn't jump.
              <View style={styles.unshadowed}>{box}</View>
            )}
          </View>
        )
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        // Not caretHidden: on iOS that also suppresses the Paste menu. A
        // transparent selection color hides the caret instead.
        selectionColor="transparent"
        accessibilityLabel="Verification code"
        style={styles.hiddenInput}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  slot: {
    flex: 1,
  },
  unshadowed: {
    paddingRight: shadow.xs,
    paddingBottom: shadow.xs,
  },
  box: {
    height: 52,
    borderRadius: radius.thumb,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxCurrent: {
    backgroundColor: colors.lime,
  },
  digit: {
    fontFamily: fonts.black,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    color: 'transparent',
    opacity: 0.011,
  },
})
