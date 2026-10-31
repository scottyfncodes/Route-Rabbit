import type { BuiltRoute } from '../../types'

interface Props {
  result: BuiltRoute
}

/**
 * Says plainly where the day's drive times came from. Real road times get one quiet
 * line; any estimated leg gets a visible note, since a guessed drive can make a
 * schedule look tighter or looser than it really is.
 */
export function DriveTimeNotice({ result }: Props) {
  const legs = result.legCount
  const estimated = result.estimatedLegCount

  if (legs === undefined || estimated === undefined) {
    return (
      <p className="text-[12.5px] text-warning leading-snug -mt-1">
        This route was built with estimated drive times. Tap Rebuild Route to get real road times.
      </p>
    )
  }
  if (legs === 0) return null
  if (estimated === 0) {
    return (
      <p className="text-[12.5px] text-muted leading-snug -mt-1">
        Drive times and miles are real road routes, with typical traffic for this day and time.
      </p>
    )
  }
  return (
    <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3">
      <p className="text-[13px] text-warning leading-snug">
        {estimated === legs ? 'All' : `${estimated} of ${legs}`} drive times on this route are estimates, marked "est." below. Real
        road times couldn't be loaded. Tap Rebuild Route when you have signal.
      </p>
    </div>
  )
}
