import { Pool, PoolConfig } from 'pg'

// pg waits for a free connection forever by default, so with the pool
// exhausted or the database unreachable a request hung until the app gave up
// (it sets no timeout of its own). After this long the query fails instead —
// a 503 from requireAuth, a 500 elsewhere — and the error reaches Sentry.
export const DB_CONNECTION_TIMEOUT_MS = 10_000

export function createPool(connectionString: string | undefined, overrides: PoolConfig = {}) {
  return new Pool({ connectionString, connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS, ...overrides })
}
