import { useEffect, useRef } from 'react'

// Lets the phone's own back button or back swipe close whatever is open (a day's
// overview, the patient form, a tab other than Home) instead of leaving the app.
//
// Each open thing adds one history entry and a handler. Back pops the newest handler.
// Closing something in-app (Cancel, "Back to Week") drops its entry so the counts stay
// matched; the entries themselves are interchangeable markers, so only the count matters.

const handlers: Array<() => void> = []
let ignorePops = 0
let pendingBacks = 0
let listening = false

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops -= 1
      return
    }
    handlers.pop()?.()
  })
}

/** Batches drops from one render into a single history step, after any new entries are added. */
function dropEntry() {
  pendingBacks += 1
  if (pendingBacks > 1) return
  queueMicrotask(() => {
    const n = pendingBacks
    pendingBacks = 0
    ignorePops += 1
    window.history.go(-n)
  })
}

export function useBackHandler(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (!active) return
    listen()
    let closedByBack = false
    const handler = () => {
      closedByBack = true
      onBackRef.current()
    }
    handlers.push(handler)
    window.history.pushState({ routeRabbit: true }, '')
    return () => {
      const i = handlers.indexOf(handler)
      if (i !== -1) handlers.splice(i, 1)
      if (!closedByBack) dropEntry()
    }
  }, [active])
}
