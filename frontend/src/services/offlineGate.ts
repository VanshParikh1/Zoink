import { HttpError, ResolvedRequest } from './http'
import { isOffline, isSimulatedOffline } from './onlineState'

/**
 * The HTTP client's first request interceptor (services/api.ts). Offline, a
 * write is refused before it's sent, marked `offline` so the screen can say
 * nothing was sent (utils/userMessage.ts), rather than left to fail mid-flight
 * or wait in a queue. Reads go through: React Query holds them until the
 * connection returns, and one sent anyway just fails. A QA build's simulated
 * offline fails reads too, as a phone with no connection would.
 */
export function refuseWhenOffline(config: ResolvedRequest): ResolvedRequest {
  if (!isOffline()) return config
  if (config.method !== 'get') {
    console.log(`[api] ${config.method.toUpperCase()} ${config.url} → not sent, offline`)
    throw Object.assign(new HttpError('Offline', config), { offline: true })
  }
  if (isSimulatedOffline()) throw new HttpError('Network Error', config)
  return config
}
