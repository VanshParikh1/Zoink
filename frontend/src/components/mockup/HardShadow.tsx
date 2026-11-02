import React, { useState } from 'react'
import { Pressable, PressableProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { shadow } from '../../theme/tokens'

type ShadowOffset = keyof typeof shadow | number

function resolveOffset(offset: ShadowOffset): number {
  return typeof offset === 'number' ? offset : shadow[offset]
}

type Props = Omit<PressableProps, 'style' | 'children' | 'disabled'> & {
  children: React.ReactNode
  /** Token key from `shadow` or a px value. */
  offset?: ShadowOffset
  color?: string
  radius?: number
  /** Degrees. */
  rotate?: number
  /** Hides the shadow (and blocks presses when `pressable`). */
  disabled?: boolean
  /** Opt-in pushed-in state: on press the content moves onto the shadow. */
  pressable?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

/**
 * Solid offset "block" shadow. RN shadow props and Android elevation always
 * blur, so the shadow is a second view in `color` peeking out from behind the
 * children. The wrapper reserves the offset as padding so a parent with
 * overflow: 'hidden' can't clip it.
 */
export default function HardShadow({
  children,
  offset = 'md',
  color = colors.ink,
  radius = 0,
  rotate,
  disabled = false,
  pressable = false,
  style,
  contentStyle,
  ...pressProps
}: Props) {
  const px = resolveOffset(offset)
  const [pressed, setPressed] = useState(false)
  const pushed = pressable && pressed && !disabled

  const outerStyle: StyleProp<ViewStyle> = [
    { paddingRight: px, paddingBottom: px },
    rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null,
    style,
  ]

  const body = (
    <>
      {disabled || pushed ? null : (
        <View
          pointerEvents="none"
          style={[styles.shadow, { left: px, top: px, borderRadius: radius, backgroundColor: color }]}
        />
      )}
      <View style={[pushed ? { transform: [{ translateX: px }, { translateY: px }] } : null, contentStyle]}>
        {children}
      </View>
    </>
  )

  if (!pressable) return <View style={outerStyle}>{body}</View>

  return (
    <Pressable
      {...pressProps}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true)
        pressProps.onPressIn?.(e)
      }}
      onPressOut={(e) => {
        setPressed(false)
        pressProps.onPressOut?.(e)
      }}
      style={outerStyle}
    >
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
})
