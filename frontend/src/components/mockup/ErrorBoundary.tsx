import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import { type } from '../../theme/typography'
import { reportRenderError } from '../../services/reportError'
import Screen from './Screen'
import LogoPill from './LogoPill'
import Button from './Button'
import StatePanel from './StatePanel'

type Props = {
  children: React.ReactNode
  /**
   * root: the whole app (last resort, remounts everything).
   * tab: one main tab; the others keep working.
   * screen: one stack screen; offers a way back.
   */
  scope: 'root' | 'tab' | 'screen'
  /** Names the tab or screen in the error report. */
  name?: string
  /** For `screen`: leaves the broken screen. */
  onGoBack?: () => void
}

type State = { error: Error | null }

/**
 * Catches a render error below it and shows a way to recover instead of a
 * blank screen. "Try again" clears the error and remounts what's inside. In
 * development React still logs the error, so the red box shows as usual.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportRenderError(error, info.componentStack, this.props.name ? `${this.props.scope}:${this.props.name}` : this.props.scope)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    const { scope, onGoBack } = this.props
    if (scope === 'tab') {
      return (
        <Screen scroll={false} contentStyle={styles.centered}>
          <StatePanel
            title="This tab hit a problem."
            body="The rest of Zoink still works. Try again, and if it keeps happening, restart the app."
            action={{ label: 'Try again', onPress: this.reset, variant: 'primary' }}
          />
        </Screen>
      )
    }

    if (scope === 'screen') {
      return (
        <Screen scroll={false} contentStyle={styles.centered}>
          <View style={styles.stack}>
            <StatePanel
              title="This screen hit a problem."
              body="Your bookings and messages are safe. Go back, or try this screen again."
              action={onGoBack ? { label: 'Go back', onPress: onGoBack, variant: 'primary' } : undefined}
            />
            <Button label="Try again" variant="secondary" onPress={this.reset} />
          </View>
        </Screen>
      )
    }

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
  centered: {
    justifyContent: 'center',
  },
  stack: {
    gap: space.lg,
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
