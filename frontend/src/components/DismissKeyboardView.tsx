import React from 'react'
import { Keyboard, StyleProp, View, ViewStyle } from 'react-native'

type Props = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

// Tap anywhere outside a focused TextInput to dismiss the keyboard — wrap the
// outermost screen content with this so it behaves consistently on iOS and
// Android instead of each screen wiring this by hand.
//
// Deliberately a plain View with a passive onTouchStart, not
// TouchableWithoutFeedback: a touchable wrapping a ScrollView competes with
// the ScrollView's native pan responder for the gesture and made every
// screen that used this (profile, listings, etc.) feel sluggish/stuck to
// scroll. onTouchStart fires without claiming the responder, so it dismisses
// the keyboard on tap without ever fighting scroll gestures.
export default function DismissKeyboardView({ children, style }: Props) {
  return (
    <View style={[{ flex: 1 }, style]} onTouchStart={() => Keyboard.dismiss()}>
      {children}
    </View>
  )
}
