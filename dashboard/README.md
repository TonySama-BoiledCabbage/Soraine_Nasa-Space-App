# Soraine Combustion Observatory

[Open the public dashboard](https://soraine-dashboard-334840303039.us-central1.run.app) · [Team handoff](TEAM-HANDOFF.md) · [Image credits](ASSET-CREDITS.md)

A JavaScript / Three.js research interface for Flame in Freefall. It combines NASA planetary imagery, material comparisons across four gravity contexts, searchable measurements and sources, and CSV/JSON exports. Open sections, thin dividers and material icons connect the research to Soraine's visual world. The [design guide](DESIGN.md) documents the shared direction.

## Run and test

Run `node server/index.mjs` from this directory, then open http://localhost:4335. No dependencies or build step are needed. Local development uses the bundled research export.

Run `node --test test/*.test.mjs` for the research contracts and backend tests. The browser suite in `test/browser.mjs` uses Playwright and Chrome; install Playwright locally if it is not already available. Set `SORAINE_TEST_URL` to test a deployed instance.

## Data

The backend reads `project-89aca125-c9a5-4fdd-bb0.flame_in_freefall_2026`, the team's independent database copy. The copy contains eight tables and three views. The original dataset is preserved in its original project.

The public API exposes selected columns from four tables: 59 measurement records, 45 experiment contexts, 307 sources and 25 supporting evidence statements at initial publication. It reads BigQuery through the Cloud Run runtime identity and caches complete results for five minutes per instance. The browser loads this data on opening or refreshing the page. It does not send a query for every click.

If a refresh fails, the backend serves its last complete result, or the included dated snapshot on a cold start. The interface distinguishes a connected BigQuery response, a stale cache and a saved snapshot. File-catalogue totals retain their original export date. No credentials, account identities, local paths, raw manifests or download logs enter the public API.

`scripts/refresh-bigquery.ps1` refreshes the static fallback using an authorized local Google Cloud login. It validates row counts before saving. Review data changes before committing them.

Results preserve source IDs, PDF pages, exact values, units, uncertainty and limitations. Experiment contexts are not independent raw trials. Starred low-gravity oxygen limits use short-duration methods different from the Earth burn criterion. The decorative globe is not a habitat-fire simulation or a map of experiment locations.

## Team development and deployment

The Node server serves `dist/` and `/api/research`. The Docker image contains only those public assets and the server. Cloud Run uses zero minimum instances and a two-instance maximum.

Dashboard changes merged into the team repository's `main` branch are configured to run checks, build a container and deploy through `.github/workflows/dashboard-deploy.yml`. Authentication uses Workload Identity Federation restricted to the team's exact repository ID, owner ID, branch and workflow path. No long-lived Google keys are stored in GitHub.

The initial cloud deployment is verified separately. The GitHub deployment workflow first runs after the integration PR is merged; a successful initial deployment does not prove that workflow has run.

The [team handoff](TEAM-HANDOFF.md) gives module locations, scene URL parameters, cloud links and access details. Teammates can work on scene rendering separately and link into a selected dashboard context.

## Credits

The music button in the header opens the optional original soundtrack, **Quiet Orbit**, with play/pause, mute and volume controls. It does not autoplay or download audio on initial page load. Playback continues while navigating research views. The original score and synthesizer are reproducible with `scripts/compose-observatory.py` (Python and NumPy); provenance is in `dist/assets/audio/README.md`.

Research contributors: Hogan, Ethan and Tony / Team Soraine. The current layout study references The Bluejack Group Dashboard on Awwwards. The planet lighting references the Three.js Earth example, implemented in WebGL for broad device support. Earth, Moon and Mars maps come from NASA sources; full credits and endpoints are in [ASSET-CREDITS.md](ASSET-CREDITS.md). Three.js's MIT license is included in `dist/vendor/`. The SI assistance record is in [SI-LOG.md](SI-LOG.md).
