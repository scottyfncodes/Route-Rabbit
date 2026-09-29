# Route Rabbit

A free, mobile-first route planner built for pediatric home-health therapists who
travel between patient homes all day. It plans the day, then hands off to Google
Maps for actual turn-by-turn navigation.

## Flow

**Home** (set your start/end location + check the weather) -> **Patients**
(initials, address, duration, available days/window) -> **Weekly** (Build My
Week lays out every day from who's available when) -> tap a day for its full
timeline/map overview, with Rebuild Route and Cancel Patient for when plans
change mid-day.

## What it does

- **Patients by initials only.** No names, DOB, diagnoses, insurance, or other PHI --
  just initials, address, visit duration, available days, a time window, an
  optional visits-per-week target, recurring blocked-time conflicts, a scheduling
  priority (High/Medium/Low, shown as a small colored dot), and whether they're
  available to fill make-up slots.
- **Build My Week.** One tap builds an optimized route for every day of the
  week from each active patient's own available days -- or build/rebuild a
  single day from its overview screen. A patient seen fewer times than
  they're available (e.g. available Mon/Wed/Fri but only needs 2x/week) gets
  the same specific days picked every week; conflicts (e.g. "Tue 12-1,
  recurring pickup") are treated as hard blocks the router schedules around.
- **Live weather, factored into the route.** The Home dashboard shows current
  conditions and a short outlook; a rainy/snowy forecast for a given day
  slows that day's estimated drive times and shows a heads-up banner on its
  overview.
- **Live Colorado road alerts (CDOT COtrip).** Each day's overview checks the built
  route against CDOT's live incidents, planned construction/closures and road-surface
  reports: a "road heads-up" card lists what's along the way (when it's active, which
  leg it's on, how far off the route), the map pins alerts and colors slick segments,
  the timeline badges affected drives, and the Next Stop card warns before you
  navigate. Construction scheduled outside your working hours is left out. Icy or
  snow-packed roads on today's route slow its drive estimates, the same way a snowy
  forecast does. Home shows what's reported within 10 miles of your start point.
- **Rebuild Route.** Cancel a visit mid-day and rebuild in seconds -- new order,
  new times, new drive estimate, with the time saved shown clearly. Visits up to
  the stop you've marked "I'm Here" stay put; only the rest of the day is re-planned.
- **Cancellation + make-up visits.** Cancelling a visit walks you through finding a
  replacement: ranked make-up candidates (High/Medium/Low scheduling priority first,
  then least added drive time) who are marked available for make-up visits, fit the
  vacated window, and aren't already on the day's route -- or just leave the slot
  open. Cancelling never deletes the patient or changes their active/discharged
  status; a chosen replacement becomes a real, persisted stop on the route (labeled
  "Make-up"), even on a day they aren't normally scheduled.
- **Open in Google Maps.** One tap opens a multi-stop driving-directions link with
  the optimized stop order. Navigation itself always happens in Google Maps.
- **Context-aware Coffee / Lunch / Parks.** Search nearby places around wherever
  you currently are (or the patient you just tapped "I'm Here" on) -- no
  copy/pasting addresses. Available on the Home dashboard and on each day's
  overview.
- **Timeline + map view** and daily efficiency stats for every built day.

## COtrip road data

Road data comes from CDOT's COtrip API through a small Vercel serverless function
(`api/cotrip.ts`) so the API key never reaches the browser. Set `COTRIP_API_KEY` in
the Vercel project's environment variables. `/api/cotrip?feed=snapshot` fetches
incidents, planned events and road conditions in one go and trims them (the raw
road-conditions feed is several MB) to the compact shapes in `api/_lib/cotrip.ts`;
responses are CDN-cached for two minutes. Only the public road data passes through
it -- no patient information is ever sent. Off Vercel (GitHub Pages, plain
`npm run dev`) the function doesn't exist and road features simply stay hidden.

## Privacy

Everything lives in the browser's local storage on your device. There's no
account, no server, and no cloud database. Patients are identified by initials
only -- the app is deliberately not built to hold PHI.

## Stack

React + TypeScript + Vite, Tailwind CSS v4, Leaflet/OpenStreetMap for the map
view, OpenStreetMap's free Nominatim service for geocoding addresses (cached
locally), and Open-Meteo's free forecast API for weather (no API key for
either). Drive times are estimated from geocoded coordinates rather than a
paid routing API -- Google Maps handles the real navigation.

## Getting started

```bash
npm install
npm run dev
```

Before pushing, run the same checks CI does:

```bash
npm run lint
npm test
npm run build
```

Open the app, dismiss the privacy notice, set a start location on the Home
tab, then add patients (initials, address, duration, available days/window)
on the Patients tab before building a route.

## Project structure

```
src/
  types.ts            Core data model (Patient, DayPlan, BuiltRoute, ...)
  lib/                 Pure logic: time formatting, geocoding, distance
                       estimation, weather, the route-optimization
                       algorithm, and Google Maps URL builders
  hooks/               localStorage-backed state for patients, day plans,
                       settings, and weather
  components/          UI building blocks, grouped by feature area
  pages/               Home (dashboard), Patients, Weekly, Settings, and
                       the day-overview screen reached from Weekly
```

The routing algorithm (`src/lib/routing.ts`) is a practical greedy
construction followed by local search (2-opt segment reversals plus single-visit
relocations), not a commercial-grade solver -- it never produces a schedule
that violates a patient's availability window, and clearly surfaces a
schedule conflict when one can't be avoided. Lunch goes into a natural gap
when there is one; otherwise later visits slide back to make room, as long as
every one of them still fits its own window. Unit tests for the routing,
make-up, and time logic live next to the code as `*.test.ts` (Vitest).
