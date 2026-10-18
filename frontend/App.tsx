import * as Sentry from '@sentry/react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import Navigation from './src/navigation'
import { StripeProvider } from '@stripe/stripe-react-native'
import { useFonts, FiraSans_400Regular, FiraSans_700Bold, FiraSans_900Black } from '@expo-google-fonts/fira-sans'
import { FiraMono_700Bold } from '@expo-google-fonts/fira-mono'
import { STRIPE_PUBLISHABLE_KEY } from './src/config/stripe'
import ErrorBoundary from './src/components/mockup/ErrorBoundary'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
    // Dev/simulator builds stall constantly (Metro reloads, debugger pauses)
    // and flood Sentry with false app-hang events.
    enableAppHangTracking: !__DEV__,
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
