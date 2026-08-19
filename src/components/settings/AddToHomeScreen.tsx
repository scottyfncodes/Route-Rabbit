import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { Button } from '../ui/Button'

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export function AddToHomeScreen() {
  const { canInstall, promptInstall, installed } = useInstallPrompt()

  if (installed || isStandalone()) return null
  if (!canInstall && !isIOS()) return null

  return (
    <section className="bg-surface border-2 border-primary-400 rounded-2xl px-4 py-4">
      <h2 className="text-[15px] font-bold text-ink mb-1.5">📲 Add to Home Screen</h2>
      {canInstall ? (
        <>
          <p className="text-[13.5px] text-muted mb-3">
            Install Route Rabbit for one-tap access from your home screen, full-screen with no browser bar.
          </p>
          <Button variant="primary" fullWidth onClick={promptInstall}>
            Add to Home Screen
          </Button>
        </>
      ) : (
        <p className="text-[13.5px] text-muted leading-relaxed">
          Tap <strong className="text-ink">Share</strong> in Safari's toolbar, then{' '}
          <strong className="text-ink">Add to Home Screen</strong> -- it'll open full-screen like a real app, right from your
          lock screen.
        </p>
      )}
    </section>
  )
}
