import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import { type } from '../../theme/typography'
import Screen from './Screen'
import LogoPill from './LogoPill'
import Button from './Button'

type Props = {
  children: React.ReactNode
  /** Where a caught render error goes (Sentry, or the console when it's off). */
  onError: (error: Error, componentStack: string | null | undefined) => void
}

type State = { error: Error | null }

/**
 * Last-resort catch for render errors anywhere under the navigator. "Try again"
 * clears the error and remounts the tree. In development React still logs the
 * error, so the red box shows as usual.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError(error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Screen glow="topLeft" scroll={false} contentStyle={styles.content}>
        <View style={styles.body}>
          <LogoPill size="lg" />
          <Text style={styles.title} accessibilityRole="header">
            Something broke.
          </Text>
          <Text style={styles.text}>
            Zoink hit an unexpected error. Your bookings and messages are safe. Try again, and if it keeps happening,
            restart the app.
          </Text>
        </View>
        <Button label="Try again" onPress={this.reset} />
      </Screen>
    )
  }
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: space.screen * 2,
  },
  body: {
    gap: space.xxl,
  },
  title: {
    ...type.h2,
    color: colors.ink,
  },
  text: {
    ...type.body,
    color: colors.mutedAlt,
  },
})
