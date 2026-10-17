import React from 'react'
import { Animated, KeyboardAvoidingView, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import ScreenBackground from './ScreenBackground'

type Props = {
  children: React.ReactNode
  glow?: React.ComponentProps<typeof ScreenBackground>['glow']
  header?: React.ReactNode
  /** Pinned below the content, above the home indicator / nav bar. */
  footer?: React.ReactNode
  scroll?: boolean
  keyboardAvoiding?: boolean
  /** Content starts at the very top (under the status bar), e.g. a full-bleed hero. */
  edgeToEdgeTop?: boolean
  /** Receives the scroll offset (native driver), for headers that react to scrolling. */
  scrollY?: Animated.Value
  contentStyle?: StyleProp<ViewStyle>
}

export default function Screen({
  children,
  glow,
  header,
  footer,
  scroll = true,
  keyboardAvoiding = false,
  edgeToEdgeTop = false,
  scrollY,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets()
  // Without a footer the content itself has to clear the bottom inset.
  const contentBottom = footer ? space.xxl : insets.bottom + space.xxl

  const content = scroll ? (
    <Animated.ScrollView
      style={styles.flex}
      onScroll={scrollY ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }) : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.content, { paddingBottom: contentBottom }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, { paddingBottom: contentBottom }, contentStyle]}>{children}</View>
  )

  const body = (
    <View style={[styles.flex, { paddingTop: edgeToEdgeTop ? 0 : insets.top + space.sm }]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      {content}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>{footer}</View> : null}
    </View>
  )

  return (
    <View style={styles.screen}>
      <ScreenBackground glow={glow} />
      <StatusBar style="dark" />
      {keyboardAvoiding ? (
        // The one platform branch: iOS needs 'padding' to lift content above the
        // keyboard, while Android already resizes the window for the keyboard and
        // 'padding' there would double the offset, so it uses 'height'.
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: space.screen,
    paddingBottom: space.lg,
  },
  content: {
    paddingHorizontal: space.screen,
  },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
  },
})
