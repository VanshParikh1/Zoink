import { TERMS_VERSION, PRIVACY_VERSION } from '@zoink/shared'

import { resolveDemoMode } from './demoModeGate'

// Dev builds only, and EXPO_PUBLIC_DEMO_MODE exactly 'true' (lowercase). The API
// modules repeat the same `__DEV__ && …` check inline so Metro can drop the
// mock modules from release bundles.
export const DEMO_MODE = resolveDemoMode(__DEV__, process.env.EXPO_PUBLIC_DEMO_MODE)

export const DEMO_TOKEN = 'zoink-demo-token'

export const DEMO_USER = {
  id: 'demo-user-1',
  email: 'demo@zoink.app',
  firstName: 'Mihir',
  verificationStatus: 'VERIFIED' as const,
  role: 'USER' as const,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
}
