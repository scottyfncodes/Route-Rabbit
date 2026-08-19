# Route Rabbit

A free, mobile-first route planner built for pediatric home-health therapists who
travel between patient homes all day. It plans the day, then hands off to Google
Maps for actual turn-by-turn navigation.

## What it does

- **Patients by initials only.** No names, DOB, diagnoses, insurance, or other PHI --
  just initials, address, visit duration, available days, and a time window.
- **Build My Route.** Pick a date, a start/end location, who you're seeing, and a
  lunch window; the app builds an efficient visit order that respects every
  patient's availability.
- **Rebuild Route.** Cancel a visit mid-day and rebuild in seconds -- new order,
  new times, new drive estimate, with the time saved shown clearly.
- **Open in Google Maps.** One tap opens a multi-stop driving-directions link with
  the optimized stop order. Navigation itself always happens in Google Maps.
- **Context-aware Coffee / Lunch / Parks.** Search nearby places around wherever
  you currently are (or the patient you just tapped "I'm Here" on) -- no
  copy/pasting addresses.
- **Timeline + map view**, daily efficiency stats, and an optional weekly glance.

## Privacy

Everything lives in the browser's local storage on your device. There's no
account, no server, and no cloud database. Patients are identified by initials
only -- the app is deliberately not built to hold PHI.

## Stack

React + TypeScript + Vite, Tailwind CSS v4, Leaflet/OpenStreetMap for the map
view, and OpenStreetMap's free Nominatim service for geocoding addresses
(cached locally). Drive times are estimated from geocoded coordinates rather
than a paid routing API -- Google Maps handles the real navigation.

## Getting started

```bash
npm install
npm run dev
```

Open the app, dismiss the privacy notice, and use **Settings -> Load Demo Day**
to try it with six fictional patients (including one with a tight, likely-
conflicting time window) without entering any real data.

## Project structure

```
src/
  types.ts            Core data model (Patient, DayPlan, BuiltRoute, ...)
  lib/                 Pure logic: time formatting, geocoding, distance
                       estimation, the route-optimization algorithm, and
                       Google Maps URL builders
  hooks/               localStorage-backed state for patients, day plans,
                       and settings
  components/          UI building blocks, grouped by feature area
  pages/               The four tabs: Today, Patients, Weekly, Settings
```

The routing algorithm (`src/lib/routing.ts`) is a practical greedy + 2-opt
local search, not a commercial-grade solver -- it never produces a schedule
that violates a patient's availability window, and clearly surfaces a
schedule conflict when one can't be avoided.
