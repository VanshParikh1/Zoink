// Whether the device is offline, as one value the HTTP client, the error
// messages, the query cache and the offline bar all read. services/network.ts
// feeds it from the device's network state; this file has no native imports
// so it can be unit-tested.

type Listener = (offline: boolean) => void

let deviceOffline = false
// QA builds only (services/network.ts): forces offline on or off over the
// device's own state, so offline handling can be checked on a simulator,
// which shares the Mac's network and has no airplane mode.
let simulated: boolean | null = null
const listeners = new Set<Listener>()

function current() {
  return simulated ?? deviceOffline
}

function update(change: () => void) {
  const before = current()
  change()
  const after = current()
  if (after !== before) for (const listener of listeners) listener(after)
}

export function isOffline(): boolean {
  return current()
}

/** Offline only because a QA build forced it (the device itself is online). */
export function isSimulatedOffline(): boolean {
  return simulated === true && !deviceOffline
}

/** From the device: only a definite "not connected" counts as offline. */
export function setDeviceOffline(offline: boolean) {
  update(() => {
    deviceOffline = offline
  })
}

export function setSimulatedOffline(offline: boolean | null) {
  update(() => {
    simulated = offline
  })
}

/** Called with the new value whenever it changes. Returns the unsubscribe. */
export function subscribeOffline(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
