import { MessageContext, userMessage } from '../utils/userMessage'

// The app's one toast: a short message for a success or a non-blocking
// error, shown by <ToastHost /> at the top of the screen. One at a time; a
// new toast replaces the one showing. Alerts stay for questions the person
// has to answer (destructive confirmations).
//
// No native imports, so screens, services and tests can all call it.

export type ToastKind = 'success' | 'error' | 'info'
export type Toast = { id: number; kind: ToastKind; message: string }

type Listener = (toast: Toast | null) => void

let nextId = 1
let current: Toast | null = null
const listeners = new Set<Listener>()

function publish(next: Toast | null) {
  current = next
  for (const listener of listeners) listener(next)
}

function show(kind: ToastKind, message: string): number {
  const toast = { id: nextId++, kind, message }
  publish(toast)
  return toast.id
}

export const toast = {
  success: (message: string) => show('success', message),
  info: (message: string) => show('info', message),
  error: (message: string) => show('error', message),
  /** The plain message for a failed request (utils/userMessage.ts). */
  failure: (error: unknown, context?: MessageContext) => show('error', userMessage(error, context)),
  /** Hides the toast with this id (or whichever is showing) if it still is. */
  dismiss(id?: number) {
    if (current && (id === undefined || current.id === id)) publish(null)
  },
}

export function currentToast(): Toast | null {
  return current
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** How long a toast stays: errors get longer to be read. */
export function toastDuration(toast: Pick<Toast, 'kind' | 'message'>): number {
  const base = toast.kind === 'error' ? 4500 : 2800
  // Long sentences get a little more time, up to 8 s.
  return Math.min(8000, base + Math.max(0, toast.message.length - 60) * 35)
}
