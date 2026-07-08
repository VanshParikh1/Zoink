export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE?.toLowerCase() === 'true'

export const DEMO_TOKEN = 'zoink-demo-token'

export const DEMO_USER = {
  id: 'demo-user-1',
  email: 'demo@zoink.app',
  firstName: 'Mihir',
  verificationStatus: 'VERIFIED' as const,
}
