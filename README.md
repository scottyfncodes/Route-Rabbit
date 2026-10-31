# Route Rabbit

Live: **https://route-rabbit.vercel.app**

A free, mobile-first route planner built for pediatric home-health therapists who
travel between patient homes all day. It plans the day, then hands off to Google
Maps for actual turn-by-turn navigation.

## Flow

**Home** (today's route at a glance, or an example day until you add patients; start location and weather below) -> **Patients**
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
- **Rebuild Route.** Cancel a visit mid-day and rebuild in seconds -- new order,
  new times, new drive estimate, with the time saved shown clearly. Visits up to
  the stop you've marked "I'm Here" stay put; only the rest of the day is re-planned,
  starting from the current time, so a visit that ran long pushes the rest of the day back.
- **Cancellation + make-up visits.** Cancelling a visit walks you through finding a
  replacement: ranked make-up candidates (High/Medium/Low scheduling priority first,
  then least added drive time) who are marked available for make-up visits, fit the
  vacated window, and aren't already on the day's route -- or just leave the slot
  open. Cancelling never deletes the patient or changes their active/discharged
  status; a chosen replacement becomes a real, persisted stop on the route (labeled
  "Make-up"), even on a day they aren't normally scheduled.
- **Open in Google Maps.** One tap opens a multi-stop driving-directions link with
  the optimized stop order, using each patient's typed address. Days with more
  stops than one Google Maps link can hold open in parts. Navigation itself always
  happens in Google Maps.
- **Works with no signal.** Once opened, the app is cached on the device, so the
  day's route, timeline, and "I'm Here" keep working offline.
- **Real drive times.** Drive times and miles come from Google's road routing,
  with typical traffic for the day and time of each leg (a 3 PM leg gets 3 PM
  traffic). They drive route building, the weekly build, make-up ranking, and
  mileage. With no signal, the app falls back to a straight-line estimate and
  marks every guessed leg "est." so a guessed schedule is never mistaken for a real one.
- **Weekly mileage.** The Weekly tab totals each built day's road miles, with a
  Copy button for a mileage log.
- **Addresses you can check.** Addresses are matched through Google Geocoding. The
  patient form shows the address it matched and a map pin you can drag onto the
  right house.
- **Backup to a file.** Settings > Backup saves everything to a file and restores
  from one. Home shows a gentle reminder once a week. No cloud account.
- **Context-aware Coffee / Lunch / Parks.** Search nearby places around wherever
  you currently are (or the patient you just tapped "I'm Here" on) -- no
  copy/pasting addresses. Available on the Home dashboard and on each day's
  overview.
- **Timeline + map view** and daily efficiency stats for every built day.

## Privacy

Everything lives in the browser's local storage on your device. There's no
account and no cloud database. Patients are identified by initials only -- the
app is deliberately not built to hold PHI.

Two small server functions talk to Google so the API key never reaches the phone:

- `api/drive-times.ts` receives only latitude/longitude pairs and a departure time.
  It rebuilds the request from those numbers alone before calling Google Routes.
- `api/geocode.ts` receives only the street address text (in a POST body, never a
  URL). No initials, names, or notes are accepted.

Patient initials and notes never leave the device.

## Stack

React + TypeScript + Vite, Tailwind CSS v4, Leaflet/OpenStreetMap for the map
view, Open-Meteo's free forecast API for weather, and Vercel serverless functions
for Google Routes (drive times), Google Geocoding (addresses), and the COtrip road
feed. Nominatim is a fallback geocoder when the server lookup is unavailable.
Google Maps handles turn-by-turn navigation.

## Deploying

Vercel is the only production home (`route-rabbit.vercel.app`), deployed from the
`claude/pediatric-route-planner-wobvs6` branch. Environment variables in Vercel:

- `GOOGLE_ROUTES_API_KEY`: a Google Maps Platform key with **Routes API** and
  **Geocoding API** enabled. Set a daily quota on it in Google Cloud.
- `COTRIP_API_KEY`: the CDOT COtrip key.

Without the Google key the app still works: drive times are estimated (and labeled
that way) and addresses fall back to Nominatim.

Drive times are cached on the device per leg, weekday, and hour for 30 days, so
rebuilding a day or a week that was built before costs no API calls. A day's
build is one distance matrix plus one small request per departure hour.

The old GitHub Pages address now shows a "moved" page (`pages-moved/`) that lets
anyone with data saved there download a backup file before switching.

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
