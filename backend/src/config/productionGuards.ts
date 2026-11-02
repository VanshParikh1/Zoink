// Boot-time checks for configuration that must never reach production. Run
// from index.ts right after env loading, so a bad deploy crashes on start
// (Railway keeps the previous deployment serving) instead of misbehaving live.

export function assertSafeProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return

  // bookingService.ensureOwnerStripeAccount assigns DEV_STRIPE_ACCOUNT_ID to any
  // owner without a connected account whenever NODE_ENV isn't 'production'.
  // It's inert while NODE_ENV=production, but a single env slip would route
  // real owners' payouts to the dev account — so it must not be set at all.
  if (env.DEV_STRIPE_ACCOUNT_ID?.trim()) {
    throw new Error(
      'Refusing to start: DEV_STRIPE_ACCOUNT_ID is set while NODE_ENV=production. ' +
        'Remove it from the production environment variables.'
    )
  }

  // Every session token is an HS256 signature with this secret; a short one
  // can be brute-forced offline from any token, which forges any account.
  if ((env.JWT_SECRET ?? '').length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `Refusing to start: JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production ` +
        '(e.g. `openssl rand -base64 48`). Changing it signs everyone out.'
    )
  }
}

export const MIN_JWT_SECRET_LENGTH = 32
