import * as Sentry from '@sentry/react-native'

/** Where a render error caught by an error boundary goes: Sentry when it's set up (App.tsx), otherwise the console. */
export function reportRenderError(error: Error, componentStack: string | null | undefined, scope: string) {
  if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: { componentStack }, tags: { boundary: scope } })
  } else {
    console.error(`Unhandled render error (${scope})`, error, componentStack)
  }
}
