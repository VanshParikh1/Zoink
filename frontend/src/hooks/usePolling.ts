import { useEffect, useRef } from 'react'
import { useAppActive } from './useAppActive'

/**
 * Calls `callback` every `intervalMs` while `enabled` (e.g. the screen is
 * focused) and the app is in the foreground. Stops otherwise, and runs once
 * immediately when the app comes back to the foreground while enabled, so a
 * resumed screen doesn't wait a full interval to catch up. The caller does its
 * own initial load.
 */
export function usePolling(callback: () => unknown, intervalMs: number, enabled: boolean) {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  }, [callback])

  const appActive = useAppActive()
  const wasAppActive = useRef(appActive)

  useEffect(() => {
    if (appActive && !wasAppActive.current && enabled) {
      latest.current()
    }
    wasAppActive.current = appActive
  }, [appActive, enabled])

  useEffect(() => {
    if (!enabled || !appActive) return
    const id = setInterval(() => latest.current(), intervalMs)
    return () => clearInterval(id)
  }, [enabled, appActive, intervalMs])
}
