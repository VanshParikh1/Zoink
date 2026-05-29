import { AuthProvider } from './src/context/AuthContext'
import Navigation from './src/navigation'
import { StripeProvider } from '@stripe/stripe-react-native'
import { STRIPE_PUBLISHABLE_KEY } from './src/config/stripe'

export default function App() {
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
    >
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </StripeProvider>
  )
}
