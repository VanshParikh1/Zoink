// Contract terms, not runtime config — deliberately not env vars. An env
// change should never be able to alter what a user is recorded as having
// agreed to. Bump these only alongside a corresponding change to the bundled
// text in packages/shared/legal/ (see packages/shared/scripts/syncLegal.ts)
// and the re-acceptance gate in frontend/src/navigation/index.tsx picks up
// the new version automatically.
export const CURRENT_TERMS_VERSION = '1.0'
export const CURRENT_PRIVACY_VERSION = '1.0'
