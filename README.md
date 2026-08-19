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
  just initials, address, visit duration, available days, and a time window.
- **Build My Week.** One tap builds an optimized route for every day of the
  week from each active patient's own available days -- or build/rebuild a
  single day from its overview screen.
- **Live weather, factored into the route.** The Home dashboard shows current
  conditions and a short outlook; a rainy/snowy forecast for a given day
  slows that day's estimated drive times and shows a heads-up banner on its
  overview.
- **Rebuild Route.** Cancel a visit mid-day and rebuild in seconds -- new order,
  new times, new drive estimate, with the time saved shown clearly.
- **Open in Google Maps.** One tap opens a multi-stop driving-directions link with
  the optimized stop order. Navigation itself always happens in Google Maps.
- **Context-aware Coffee / Lunch / Parks.** Search nearby places around wherever
  you currently are (or the patient you just tapped "I'm Here" on) -- no
  copy/pasting addresses. Available on the Home dashboard and on each day's
  overview.
- **Timeline + map view** and daily efficiency stats for every built day.

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

Open the app, dismiss the privacy notice, and use **Settings -> Load Demo Day**
to try it with six fictional patients (including one with a tight, likely-
conflicting time window) without entering any real data.

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

The routing algorithm (`src/lib/routing.ts`) is a practical greedy + 2-opt
local search, not a commercial-grade solver -- it never produces a schedule
that violates a patient's availability window, and clearly surfaces a
schedule conflict when one can't be avoided.
