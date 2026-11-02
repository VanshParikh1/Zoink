/**
 * Demo mode is on only in a development build (`__DEV__`) whose bundle was
 * made with EXPO_PUBLIC_DEMO_MODE exactly 'true'. Both inputs are fixed at
 * build time, so a release build can never turn it on, whatever .env file
 * happens to be on the machine that built it.
 */
export function resolveDemoMode(isDev: boolean, flag: string | undefined): boolean {
  return isDev && flag === 'true'
}
