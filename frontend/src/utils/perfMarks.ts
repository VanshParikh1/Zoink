import { useMemo, useRef } from 'react'

// Startup and scroll timings for measurement builds. Silent unless the bundle
// was built with EXPO_PUBLIC_PERF_LOG=1, so normal builds carry the calls but
// never log. Lines go out through console.error because a release build only
// forwards error-level JS logs to the device log:
//
//   xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "[perf]"'
const ENABLED = process.env.EXPO_PUBLIC_PERF_LOG === '1'
const FRAME_MS = 1000 / 60

const logged = new Set<string>()

/** Milliseconds since the native app process started (React Native's
 *  startup timer), or null where the runtime doesn't report it. */
function sinceAppStart(): number | null {
  const timing = (globalThis.performance as any)?.rnStartupTiming
  const start = timing?.startTime
  return typeof start === 'number' && start > 0 ? performance.now() - start : null
}

/** Logs the first time `name` is reached in this launch (e.g. the first screen
 *  past the boot gate, or Home's first listings on screen). */
export function markStartup(name: string) {
  if (!ENABLED || logged.has(name)) return
  logged.add(name)
  const ms = sinceAppStart()
  console.error(`[perf] startup ${name} ${ms == null ? 'n/a' : `${Math.round(ms)}ms`}`)
}

/**
 * Scroll handlers that count JS frames while a list is moving and log the
 * result when it settles: frames seen, frames that took longer than 1.5x a
 * 60 Hz frame (dropped), and the average JS FPS. Returns an empty object in
 * normal builds, so spreading it onto a list costs nothing.
 */
export function useScrollPerfProbe(name: string) {
  const state = useRef({ running: false, frames: 0, dropped: 0, startedAt: 0, last: 0, raf: 0 })

  return useMemo(() => {
    if (!ENABLED) return {}

    const tick = (now: number) => {
      const s = state.current
      if (!s.running) return
      if (s.last) {
        const gap = now - s.last
        s.frames += 1
        if (gap > FRAME_MS * 1.5) s.dropped += Math.round(gap / FRAME_MS) - 1
      }
      s.last = now
      s.raf = requestAnimationFrame(tick)
    }

    const start = () => {
      const s = state.current
      if (s.running) return
      Object.assign(s, { running: true, frames: 0, dropped: 0, startedAt: performance.now(), last: 0 })
      s.raf = requestAnimationFrame(tick)
    }

    const stop = () => {
      const s = state.current
      if (!s.running) return
      s.running = false
      cancelAnimationFrame(s.raf)
      const seconds = (performance.now() - s.startedAt) / 1000
      const fps = seconds > 0 ? s.frames / seconds : 0
      console.error(`[perf] scroll ${name} frames=${s.frames} dropped=${s.dropped} jsFps=${fps.toFixed(1)} duration=${seconds.toFixed(2)}s`)
    }

    return {
      onScrollBeginDrag: start,
      onMomentumScrollEnd: stop,
      onScrollEndDrag: (e: { nativeEvent: { velocity?: { y?: number } } }) => {
        // A drag released without momentum never fires onMomentumScrollEnd.
        if (!e.nativeEvent.velocity?.y) stop()
      },
    }
  }, [name])
}
