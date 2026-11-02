/**
 * Runs one submission at a time: a second call while the first is still in
 * flight is dropped, not queued. A button's disabled/loading state only
 * takes effect on the next render, so two taps inside one frame both reach
 * onPress; this check doesn't wait for a render.
 *
 * Returns true when the call ran, false when it was dropped.
 */
export function createSubmitGuard() {
  let inFlight = false
  return {
    get busy() {
      return inFlight
    },
    async run(task: () => Promise<unknown>): Promise<boolean> {
      if (inFlight) return false
      inFlight = true
      try {
        await task()
      } finally {
        inFlight = false
      }
      return true
    },
  }
}
