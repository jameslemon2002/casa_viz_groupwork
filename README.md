# London Shared Bike Rhythms

Single-page scrollytelling website for the 2025 Santander Cycles archive.

## Research Question

**How does London's bike-share network change across hours, weekdays and weekends, and how do these temporal rhythms reorganise space across the city?**

## What This Version Does

- one canonical route: `/`
- full-screen hero map, then left-story / right-map longform layout
- true hourly OD slices for `all / weekdays / weekends`
- weekend comparison chart that can switch the map to the same hour in weekday or weekend mode
- `ghost compare` in the weekend act:
  weekday flows stay blue, weekend flows stay gold
- fixed-camera `2.5D` map stage using `MapLibre + deck.gl`

## Story Structure

1. Hero
2. 24-hour rhythm
3. Weekday peak
4. Weekend city
5. Spatial shift
6. Conclusion
7. Method appendix

## Tech Stack

- React
- TypeScript
- Vite
- MapLibre GL
- deck.gl

## Frontend Data Used By The Live Site

Only these frontend assets are required by the current site:

- `public/data/flows_hourly.json`
- `public/data/typical_week_story.json`
- `public/data/london-boroughs.geojson`
- `public/data/london-outline.geojson`
- `public/data/cycle_infrastructure.geojson`

## Development

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4182
```

## Build

```bash
npm run build
```

## Data Rebuild

If you want to rebuild the current story datasets:

```bash
npm run data:stations
npm run data:trips:annual
npm run data:build:boroughs
npm run data:build:story
npm run data:build:hourly
```

## Repository Scope

This repository has been trimmed to the current coursework version only.

- old archive material should not remain part of the deliverable
- the live project is the `v3` storytelling build on branch `codex/v3-visual-pivot`
- raw source archives are not intended to stay in the final GitHub upload
