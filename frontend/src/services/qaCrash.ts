import { useSyncExternalStore } from 'react'

// QA builds only (EXPO_PUBLIC_QA_TOOLS=1): zoink://qa/crash/root, /tab and
// /screen make that level throw until its error boundary catches it, so each
// error boundary's recovery can be checked in a Release build. Release builds
// without the flag never set it.

export type CrashLevel = 'root' | 'tab' | 'screen'

let armed: CrashLevel | null = null
const listeners = new Set<() => void>()

export function armCrash(level: CrashLevel) {
  armed = level
  for (const listener of listeners) listener()
}

/** Called by an error boundary once it has caught the crash, so its Try again
 *  renders normally. A no-op unless a QA crash is armed. */
export function disarmCrash() {
  if (!armed) return
  armed = null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Throws when a crash is armed for this level and `active` says this is the
 * place showing. It keeps throwing until the boundary that catches it calls
 * disarmCrash: clearing `armed` here, mid-render, made React's synchronous
 * retry of the failed render succeed, so React kept the normal tree while
 * Android kept drawing the fallback, and no tap reached JS after that.
 */
export function useQaCrash(level: CrashLevel, active = true) {
  const current = useSyncExternalStore(subscribe, () => armed)
  if (current === level && active) {
    throw new Error(`QA: render error at ${level} level`)
  }
}
