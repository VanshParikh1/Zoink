import api from './api'
import { DEMO_MODE } from '../config/demoMode'

export type ConnectAccountResponse = {
  stripeAccountId: string
  url: string
}

export async function initiateConnectAccount(): Promise<ConnectAccountResponse> {
  if (DEMO_MODE) {
    return {
      stripeAccountId: 'acct_mock123',
      url: 'https://connect.stripe.com/express/onboarding/mock',
    }
  }

  const res = await api.post('/payments/connect-account')
  return res.data
}
