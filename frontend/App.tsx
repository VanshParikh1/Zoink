import * as Sentry from '@sentry/react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import Navigation from './src/navigation'
import { StripeProvider } from '@stripe/stripe-react-native'
import { STRIPE_PUBLISHABLE_KEY } from './src/config/stripe'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: __DEV__ ? 'development' : 'production',
  })
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          urlScheme="zoink"
        >
          <AuthProvider>
            <Navigation />
          </AuthProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
