# How London Borrows Its Bikes

Scrollytelling website and route-lens exploration for London's Santander Cycles usage rhythms.

Live site:

<https://jameslemon2002.github.io/casa_viz_groupwork/>

Repository:

<https://github.com/jameslemon2002/casa_viz_groupwork>

## Project Focus

The project asks how the same inner London docking-bike network is used differently across a typical day. It reads bike-share demand as a temporal layer of urban accessibility: fixed docking infrastructure is reweighted by commuting peaks, leisure rhythms, park use and the night-time economy.

The main deliverable is a single guided story page with a full-screen hero, scroll-driven text, a fixed map stage, inline evidence cards, a function-regime matrix, an About/Method/References appendix and a final free-exploration route lens.

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
- An About, Method and References appendix for data assumptions, modelling limits, attribution and literature links.

## What The Route Layer Means

The route layer is an inferred street-use allocation, not GPS traces. OD pairs are assigned to an OSM-derived service-area street graph with a seeded stochastic multi-route model and distance-decay weighting.

Route intensity uses one global visual scale across all time slices. This avoids late-night or low-demand hours appearing artificially strong simply because their own local maximum is small.

The 2025 processing pipeline retains 8,846,143 valid TfL Santander Cycles trips across 797 matched stations. The route assignment uses 36,960 OD candidate pairs on a street graph with 337,680 nodes and 359,397 edges. Model settings are four alternative routes, detour limit 1.55, distance-decay alpha 3.2, stochastic jitter 0.18 and seed 2025.

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
- `service_context_pois.geojson`
- `service_landuse_context.geojson`
- `od_route_lens/*.json`
- `route_details/*.json`

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

## Methodology And References

The project methodology is summarised in the website About, Method and References appendix and in `public/docs/Methodology_Summary_Group20.pdf`.

Core references used in the framing:

- O'Brien, Cheshire and Batty (2014), bicycle sharing data as evidence for sustainable transport systems: <https://doi.org/10.1016/j.jtrangeo.2013.06.007>
- Fishman (2016), bike-share literature review: <https://doi.org/10.1080/01441647.2015.1033036>
- Faghih-Imani et al. (2014), bike-share flows and land-use / urban form: <https://doi.org/10.1016/j.jtrangeo.2014.01.013>
- TfL Santander Cycles usage statistics: <https://cycling.data.tfl.gov.uk/>
- OpenStreetMap and Overpass API context layers.

## Repository Scope

This repository is aligned around the final guided map story. `main` is the canonical submitted version and GitHub Pages deploys from that branch only.
