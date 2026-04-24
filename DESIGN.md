# Design System: London Bike Share Temporal Geography

## Direction

The product is a guided temporal atlas, not a dashboard and not a visual-effects demo. The tone is calm editorial cartography: restrained contrast, clear units, flat north-up maps, one stable map grammar, and compact evidence panels.

## Core Question

How do seasonal, weekly and hourly rhythms shape the street-level geography of London's bike-share use?

## Visual Grammar

- Primary map layer: inferred stochastic route-use allocation on streets.
- Road color and width: inferred average trips per selected profile day.
- Station circles: not shown in the primary route-flow view. Use stations only in a dedicated station diagnostic layer.
- OD arcs: optional diagnostic or case-study layer only; not the primary story view.
- Charts: evidence panels that explain the current time scale.

## Palette

- Background: near-black editorial map base.
- Primary route flow: muted teal for all-days profile.
- Weekday contrast: restrained blue.
- Weekend contrast: muted amber.
- Seasonal evidence: warm gold plus green-grey.
- Avoid neon cyan/magenta, purple gradients, glassmorphism and floating bokeh effects.

## Typography

- Interface and body: IBM Plex Sans.
- Titles: Space Grotesk.
- Use compact sentences and analytical labels.
- Avoid slogans such as "city breathes", "many temporal Londons" and "same network".

## Interaction

- Scroll advances the guided story.
- The hourly section exposes all 24 hours equally through the timeline.
- Weekday/weekend comparison uses average trips per profile day.
- Hover road segments to inspect inferred edge flow and top OD contributors.
- Hover stations for activity context.
- Final explorer controls remain minimal: profile, hour and layer.

## Data Labels

Every numeric display must identify its metric basis:

- Annual totals are used for dataset scale.
- Month and season charts use average trips per calendar day.
- Weekday/weekend comparisons use average trips per weekday or weekend day.
- Route-flow maps use inferred average trips per selected profile day.

## Method Language

Always say "inferred route-use allocation" or "inferred street-use layer". Do not imply GPS traces, observed route choice or causal infrastructure effects. Method panels must mention graph source, stochastic distance-decay assignment, station snapping, unreachable OD pairs and normalization.

## Mobile

On mobile, story text takes priority over full interactivity. The map remains readable as a stable background, controls compress vertically, and evidence panels avoid dense multi-column layouts.

## Forbidden Patterns

- Full-screen glass demo layout as the main product.
- 2.5D pitch/bearing as the default map camera.
- Neon or visionOS styling.
- Annual map as the assumed starting argument.
- Hand-picked hour chapters replacing the full 24-hour timeline.
- Unlabeled units or raw weekday/weekend totals presented as comparable.
- Shipping the 25MB raw infrastructure layer as a visible frontend layer.
- Unexplained point fields over a road-flow map.
