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
}
