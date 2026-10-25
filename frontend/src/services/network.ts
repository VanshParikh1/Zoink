import { useSyncExternalStore } from 'react'
import * as Network from 'expo-network'
import { onlineManager } from '@tanstack/react-query'
import { isOffline, setDeviceOffline, setSimulatedOffline, subscribeOffline } from './onlineState'

// The device's connection, from expo-network (NWPathMonitor on iOS,
// ConnectivityManager on Android), into onlineState. Only a definite "not
// connected" counts: an unknown state is treated as online, so a flaky
// reading never blocks a write that would have gone through.
//
// React Query follows it: while offline, queries wait instead of failing
// (a screen with nothing cached shows its offline state), and when the
// connection returns, waiting and stale queries on screen fetch again.

function offlineFrom(state: Network.NetworkState) {
  return state.isConnected === false
}

let started = false

export function startNetworkWatch() {
  if (started) return
  started = true
  Network.getNetworkStateAsync()
    .then((state) => setDeviceOffline(offlineFrom(state)))
    .catch(() => {})
  Network.addNetworkStateListener((state) => setDeviceOffline(offlineFrom(state)))
  onlineManager.setEventListener((setOnline) => {
    setOnline(!isOffline())
    return subscribeOffline((offline) => setOnline(!offline))
  })
}

/** True while the device is offline; re-renders when that changes. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, isOffline)
}

/**
 * QA builds only (EXPO_PUBLIC_QA_TOOLS=1): zoink://qa/offline/on, /off and
 * /device force the app offline or online, or hand back to the device. The
 * HTTP client then fails every request as a phone in airplane mode would.
 * Release builds without the flag drop this code.
 */
export const QA_TOOLS = process.env.EXPO_PUBLIC_QA_TOOLS === '1'

export function simulateOffline(mode: 'on' | 'off' | 'device') {
  if (!QA_TOOLS) return
  setSimulatedOffline(mode === 'device' ? null : mode === 'on')
}
