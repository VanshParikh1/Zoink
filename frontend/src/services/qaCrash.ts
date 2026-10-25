import { useSyncExternalStore } from 'react'

// QA builds only (EXPO_PUBLIC_QA_TOOLS=1): zoink://qa/crash/root, /tab and
// /screen make the next render at that level throw once, so each error
// boundary's recovery can be checked in a Release build. Release builds
// without the flag never set it.

export type CrashLevel = 'root' | 'tab' | 'screen'

let armed: CrashLevel | null = null
const listeners = new Set<() => void>()

export function armCrash(level: CrashLevel) {
  armed = level
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Throws (once) when a crash is armed for this level and `active` says this is the place showing. */
export function useQaCrash(level: CrashLevel, active = true) {
  const current = useSyncExternalStore(subscribe, () => armed)
  if (current === level && active) {
    armed = null
    throw new Error(`QA: render error at ${level} level`)
  }
}
