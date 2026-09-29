import { TERMS_VERSION, PRIVACY_VERSION } from '@zoink/shared'

// Exactly 'true' (lowercase), the same comparison the API modules use to decide
// at build time whether to bundle the mock data at all.
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true'

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
