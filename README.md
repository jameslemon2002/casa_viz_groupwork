# How London Borrows Its Bikes

Carbon-Brief-inspired scrollytelling website for London's Santander Cycles usage rhythms.

Live site:

<https://jameslemon2002.github.io/casa_viz_groupwork/>

Repository:

<https://github.com/jameslemon2002/casa_viz_groupwork>

## Project Focus

The project asks how the same inner London docking-bike network is used differently across a typical day. It does not treat the bikes or stations as changing infrastructure. Instead, it visualises changing usage regimes: weekday work access, midday park and cultural circulation, weekend leisure use, and late-evening central activity.

The main deliverable is a single guided story page with a full-screen hero, scroll-driven text, a fixed map stage, inline evidence cards, and a final free-exploration section.

## Current Version

- Default route: `/`
- Canonical story route: `/map-review`
- Public deployment branch: `main`
- Current live commit: latest `main`
- Team: Rong Zhao · Zhuohang Duan · Dailing Wu

There is no separate PR workflow required for the coursework submission. The public GitHub Pages site is deployed directly from `main` through GitHub Actions.

## What The Site Shows

- Inferred street-use route segments from hourly OD pairs.
- Weekday and weekend time stops in a guided scrollytelling sequence.
- Functional anchors and area labels for work, parks, leisure, and night-city contexts.
- Compact evidence charts for selected story moments.
- A free-exploration panel for profile, hour, and layer switching.
- A Method and Credits appendix for data assumptions and modelling limits.

## What The Route Layer Means

The route layer is an inferred street-use allocation, not GPS traces. OD pairs are assigned to a simplified service-area street graph with a seeded stochastic multi-route model and distance-decay weighting.

Route intensity uses one global visual scale across all time slices. This avoids late-night or low-demand hours appearing artificially strong simply because their own local maximum is small.

## Frontend Data

The live site uses prebuilt assets in `public/data/`, including:

- `flows_hourly.json`
- `typical_week_story.json`
- `temporal_summary.json`
- `regime_summary.json`
- `stations.json`
- `stations.geojson`
- `route_flows.json`
- `route_flows/*.json`
- `london-boroughs.geojson`
- `london-outline.geojson`
- `service_greenspaces.geojson`

The route-flow slices are stored in compact format to keep GitHub Pages loading practical while retaining all routed edges for display.

## Development

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Open:

```text
http://127.0.0.1:5174/
```

## Build

```bash
npm run build
```

## Data Rebuild

The checked-in site already includes the built frontend data. If the source data changes, rebuild in this order:

```bash
npm run data:build:stations
npm run data:trips:annual
npm run data:build:boroughs
npm run data:build:story
npm run data:build:hourly
npm run data:build:temporal
npm run data:build:regimes
npm run data:fetch:street-network
npm run data:fetch:greenspaces
npm run data:build:route-flows
npm run data:optimize:route-flows
npm run build
```

## Deployment

GitHub Pages is deployed by `.github/workflows/deploy-pages.yml`.

Deployment source:

- branch: `main`
- mode: GitHub Actions
- output: `dist/`

The workflow builds with Vite and publishes the generated static site to GitHub Pages.

## Repository Scope

This repository is aligned around the final Carbon-style map story. `main` is the canonical submitted version and GitHub Pages deploys from that branch only.
