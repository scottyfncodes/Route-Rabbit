import { Button } from '../ui/Button'

interface Props {
  onDismiss: () => void
}

export function PrivacyOnboarding({ onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 pt-10">
      <div className="bg-surface rounded-3xl w-full max-w-[480px] px-6 py-7 space-y-4">
        <div className="text-[40px] leading-none">🐰</div>
        <h1 className="text-[22px] font-extrabold text-ink">Welcome to Route Rabbit</h1>
        <p className="text-[15px] text-ink leading-relaxed">
          A fast route planner built for pediatric home-health therapists. Everything is stored locally on this device --
          there's no account and nothing is uploaded.
        </p>
        <div className="bg-mint-50 border border-mint-200 rounded-2xl px-4 py-3.5">
          <p className="text-[13.5px] text-ink leading-relaxed">
            <strong>This app is designed to store minimal scheduling information locally on your device. Do not enter
            protected health information.</strong> Use patient initials only -- never full names, diagnoses, or medical
            records.
          </p>
        </div>
        <Button size="lg" fullWidth onClick={onDismiss}>
          Got it, let's go
        </Button>
      </div>
    </div>
  )
}
