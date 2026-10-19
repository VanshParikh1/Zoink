import * as Sentry from '@sentry/react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import Navigation from './src/navigation'
import { StripeProvider } from '@stripe/stripe-react-native'
import { useFonts } from 'expo-font'
// One weight per import: the package roots reference every weight, which
// shipped all 18 Fira Sans and 3 Fira Mono files (8.4 MB) for these four.
import { FiraSans_400Regular } from '@expo-google-fonts/fira-sans/400Regular'
import { FiraSans_700Bold } from '@expo-google-fonts/fira-sans/700Bold'
import { FiraSans_900Black } from '@expo-google-fonts/fira-sans/900Black'
import { FiraMono_700Bold } from '@expo-google-fonts/fira-mono/700Bold'
import { STRIPE_PUBLISHABLE_KEY } from './src/config/stripe'
import ErrorBoundary from './src/components/mockup/ErrorBoundary'
import { scrubBreadcrumb, scrubEvent } from './src/services/sentryScrub'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
    // Dev/simulator builds stall constantly (Metro reloads, debugger pauses)
    // and flood Sentry with false app-hang events.
    enableAppHangTracking: !__DEV__,
    // Credentials, emails, phone numbers, push tokens and codes never leave
    // the phone in a report, by the same rules as the server (see
    // src/services/sentryScrub.ts).
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

function reportRenderError(error: Error, componentStack: string | null | undefined) {
  if (sentryDsn) {
    Sentry.captureException(error, { extra: { componentStack } })
  } else {
    console.error('Unhandled render error', error, componentStack)
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    FiraSans_400Regular,
    FiraSans_700Bold,
    FiraSans_900Black,
    FiraMono_700Bold,
  })
  // A failed load falls back to the system font rather than hanging on the spinner.
  if (fontError) console.error('Failed to load fonts', fontError)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          urlScheme="zoink"
        >
          <AuthProvider>
            <ErrorBoundary onError={reportRenderError}>
              <Navigation fontsReady={fontsLoaded || !!fontError} />
            </ErrorBoundary>
          </AuthProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
