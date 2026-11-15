# Working together on Soraine

The shared dashboard source lives in `dashboard/` in the team repository. Make a branch, change the relevant module, run the checks, then open a pull request. Once this integration is merged, accepted dashboard changes on `main` are deployed by `.github/workflows/dashboard-deploy.yml`.

## Shared cloud project and data

- Hosting/data project: `project-89aca125-c9a5-4fdd-bb0` (Soraine Dashboard)
- Region: `us-central1`; BigQuery dataset location: `US`
- Dataset: `flame_in_freefall_2026`
- Cloud Run service: `soraine-dashboard`
- [Open BigQuery](https://console.cloud.google.com/bigquery?project=project-89aca125-c9a5-4fdd-bb0)
- [Open the hosting project](https://console.cloud.google.com/run?project=project-89aca125-c9a5-4fdd-bb0)

The database is an independent copy of the original eight tables and three views. It is not continuously synchronized with the original project. The copied views refer to tables in this project. Coordinate research edits here to keep the team on one version.

The three accounts Hogan approved can edit this dataset and run queries. They can also develop Cloud Run services, view builds/logs, and deploy with the dedicated runtime identity. Project ownership and billing administration remain with Hogan. GitHub access is separate; Tony manages collaborator permissions and merging in the team repository.

The public backend reads only `sources`, `experiments`, `measurements`, and `evidence`, with explicit column lists. It caches complete exports for five minutes per instance. It uses its Cloud Run identity, with no downloaded service-account keys. Raw records, file manifests and download logs stay in BigQuery. Catalogue totals come from the dated fallback export.

## Connect a Moon or Mars scene

Use the shared helper from either scene. Copy or import this module with `data.mjs` from the same directory:

```js
import {researchUrl} from './dashboard/dist/scene-link.mjs';

// Run from a user click on the selected material's “View research” control.
window.open(researchUrl({
  world: 'moon', // earth, moon, mars, iss, microgravity
  material: 'Ultem 1000', // Ultem 1000, Mylar G, Nomex HT90-40
  view: 'compare' // overview, compare, evidence, sources
}), '_blank', 'noopener');
```

For a local scene, link to `dashboard/dist/` when serving the complete repository statically. Static hosting reads the saved research JSON; Cloud Run provides `/api/research`. Do not place Google credentials in scene JavaScript.

For an exact result, add `record: 'E014'`. Its source-and-conditions drawer opens on arrival. With `view: 'evidence'`, the supplied environment and material also filter the table. Use the same helper with `world: 'mars'` for Johnson's scene. The helper accepts an optional second argument for a local dashboard base URL.

The inspected `models-only` and `physics-integration` branches in Ethan's repository use `kitchen/pages.js` for the detail panel and `selectScenario()` in `kitchen/main.js` for scene selection. Wire a normal link or click handler into that detail panel using `this.scenario.slug` as the environment. Keep the material tied to a real experimental sample; a kitchen object such as a spoon is not automatically an Ultem sample. These branches have been inspected, not merged into this contribution.

The reusable data functions are in `dist/data.mjs`: `joinResearch`, `filterRows`, `getLimits`, and `comparisonRows`. Environment selection describes experimental gravity; it does not automatically set a cabin's pressure or oxygen fraction. No Google login or database credentials are needed by the scene renderer.

## Module ownership

| Work | Files |
|---|---|
| Research layout, navigation and details | `dist/app.mjs`, `dist/observatory.css`, `dist/observatory-responsive.css`, `dist/index.html` |
| Scene links and brand rules | `dist/scene-link.mjs`, `DESIGN.md` |
| Planet rendering and shaders | `dist/globe.mjs`, `dist/planet-materials.mjs` |
| Research filtering and comparison | `dist/data.mjs` |
| Public data contract, caching and API | `server/research.mjs`, `server/index.mjs` |
| Deployment | `Dockerfile`, `.github/workflows/dashboard-deploy.yml` |

Run `node server/index.mjs` and open `http://localhost:4335`. Local development uses the bundled snapshot. Run `node --test test/*.test.mjs` before a PR. Browser checks live in `test/browser.mjs` and use Playwright with an isolated Chrome profile.

GitHub deployment uses Workload Identity Federation restricted to this exact repository, `main`, and the dashboard workflow. Pull requests run tests but cannot obtain deployment credentials. Cloud Run scales to zero when idle and has a maximum of two instances. Hosting, builds and database usage can incur Google Cloud charges.
