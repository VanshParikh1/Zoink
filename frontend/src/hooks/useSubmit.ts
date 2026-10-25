import { useCallback, useEffect, useRef, useState } from 'react'
import { createSubmitGuard } from '../utils/submitGuard'
import { toast } from '../services/toast'

/**
 * A form's submit handler that can't run twice at once (see submitGuard.ts),
 * and `busy` for the button's loading state. `task` handles its own errors;
 * anything it lets through is shown as a plain error toast, never thrown.
 */
export function useSubmit<A extends unknown[]>(task: (...args: A) => Promise<unknown>) {
  const guard = useRef(createSubmitGuard()).current
  const latest = useRef(task)
  latest.current = task
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const submit = useCallback(
    (...args: A) => {
      if (guard.busy) return
      setBusy(true)
      guard
        .run(() => latest.current(...args))
        .catch((error) => toast.failure(error))
        .finally(() => {
          if (mounted.current) setBusy(false)
        })
    },
    [guard]
  )

  return [submit, busy] as const
}
