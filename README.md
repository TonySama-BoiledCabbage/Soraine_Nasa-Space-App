# Soraine · Flame in Freefall

NASA Space Apps 2026 webapp. A kitchen with no walls stands on a planet surface. Switching gravity (Earth, Mars, Moon, ISS) sends a scan wave out from the stove flame. Inside the wave the world is already under the new gravity: terrain, sky, lighting, the flame's shape, and loose props that react through a rigid-body sim. Outside it, the old gravity still applies.

## Run locally

Windows: double-click `start.bat`, then open http://localhost:5180.
Anywhere else: `python serve.py 5180`.
ES modules and GLB files need a real `http://` origin, so opening `index.html` straight from disk won't work.

## Layout

| Path | What |
|---|---|
| `index.html`, `kitchen/` | Front end: Three.js scene, scan post-pass, terrain, meadow, stars, props physics, pages |
| `data/scenarios.json` | Per-scenario gravity, sky, fog, flame parameters, terrain model and placement, facts with sources |
| `models/planet_surfaces/` | Earth meadow, Moon and Mars low-poly terrains (Blender) |
| `vendor/` | three.js 0.160, GLTFLoader, cannon-es 0.20, bundled so nothing loads from a CDN |
| `backend/` | `python -m backend check` validates data contracts. `python -m backend build <new-dir>` produces a static release (allowlisted files) |
| `tools/blender/` | Scripts that regenerate the terrain GLBs |

## Notes

- The flame shapes and the props' scan "kick" are visual heuristics, not combustion or measured data. Facts in `scenarios.json` carry a `src` field, and entries marked `schematic` or `unverified` are labelled as such in the UI.
- The terrains are procedural concept models. Their relief is not to scale.

## Shared research dashboard

[Open the public dashboard](https://soraine-dashboard-334840303039.us-central1.run.app) · [Team integration guide](dashboard/TEAM-HANDOFF.md)

The Three.js research dashboard combines NASA planetary maps with material comparisons, searchable evidence and source links. Its Cloud Run backend reads the team-owned BigQuery copy. Source is in `dashboard/`; the scene code above remains independently editable.

Dashboard changes merged into `main` run tests and deploy through the included GitHub Actions workflow. See the team guide for Moon/Mars links, database access and module ownership.
