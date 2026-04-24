# Design Notes: How London Borrows Its Bikes

## Direction

The project is an editorial scrollytelling map, not a dashboard. The page should read like a Carbon-Brief-style visual article: a centered hero, a guided text rail, a fixed map stage, compact evidence charts, and a final free-exploration panel.

## Core Argument

The Santander Cycles network is physically stable, but its use changes through the day. The story should show how the same docking system is repurposed across work access, park and cultural circulation, leisure movement, and late-evening central activity.

## Page Structure

- Hero: full-screen centered cover using the real route map background as context.
- Guided Story: scroll-driven article stops, each connected to a data state.
- Evidence Cards: small charts inserted only where they clarify the argument.
- Free Exploration: profile, hour and layer controls after the guided narrative.
- Method and Credits: concise appendix for data, modelling assumptions and team attribution.

## Map Grammar

- Primary layer: inferred street-use route segments from hourly OD pairs.
- Route colour: one consistent route hue, with intensity carrying volume.
- Route scale: global across slices so quiet hours are not artificially bright.
- Function anchors: saturated circles for work, park, leisure and night-city contexts.
- Area labels: muted grey-white place names for orientation, not station numbering.
- Explore layers: routes and hotspots only.

## Data Language

Use "inferred route-use allocation" or "inferred street-use layer". Do not imply GPS traces, observed route choice, causal infrastructure effects, or a complete Greater London system.

## Interaction

- Scrolling activates a story stop when the paragraph reaches the reading zone near the centre of the viewport.
- The map changes profile, hour, route segments, hotspots, function anchors and labels together.
- Function anchors keep a fixed visual position while hover opens a small tooltip above the point.
- The free-exploration map is the only fully interactive map.

## Visual Tone

- Base map: blue-grey, high contrast, Carbon-Brief-adjacent.
- Routes: bright but controlled cyan-blue linework.
- Function anchors: bold pink, orange, blue and green.
- Text: serif body copy for article rhythm, geometric sans for labels and controls.
- Avoid fake decorative routes, station-number labels, glass-heavy cards and unexplained polygons.

## Submission Scope

`main` is the canonical coursework version. The repository should expose the final guided story rather than earlier prototype routes or dashboards.
