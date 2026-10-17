import { createContext, useContext, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'

export type MainTab = 'Home' | 'Search' | 'Inbox' | 'MyProfile'

// MainAppScreen keeps all four tabs mounted side by side in a pager, so a
// tab's own focus effects fire whenever the main screen regains focus, even
// when that tab is off-screen. This carries the tab actually showing.
const MainTabContext = createContext<MainTab | null>(null)

export const MainTabProvider = MainTabContext.Provider

/** The tab on screen inside MainAppScreen, or null outside it. */
export function useMainTab() {
  return useContext(MainTabContext)
}

/**
 * True when this tab is the one on screen and the main screen is focused.
 * Outside MainAppScreen (the standalone stack routes) it's just focus.
 */
export function useIsTabActive(tab: MainTab) {
  const activeTab = useContext(MainTabContext)
  const isFocused = useIsFocused()
  return isFocused && (activeTab === null || activeTab === tab)
}

/**
 * Calls `load` the first time the tab becomes active, and again when it's
 * active after the main screen lost focus (a pushed screen may have changed
 * its data). Switching between tabs alone doesn't reload.
 */
export function useTabLoad(tab: MainTab, load: () => unknown) {
  const isActive = useIsTabActive(tab)
  const isFocused = useIsFocused()
  const stale = useRef(true)
  const latest = useRef(load)
  useEffect(() => {
    latest.current = load
  }, [load])

  useEffect(() => {
    if (!isFocused) stale.current = true
  }, [isFocused])

  useEffect(() => {
    if (isActive && stale.current) {
      stale.current = false
      latest.current()
    }
  }, [isActive])
}
