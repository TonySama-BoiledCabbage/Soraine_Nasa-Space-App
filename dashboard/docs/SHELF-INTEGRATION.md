# Material shelf integration

The dashboard opens Tony's shelf on demand at `/library/?data=api&shop&embedded`. The iframe stays mounted when closed, preserving the basket and loaded models. Closing it pauses its physics and rendering; reopening resumes the same instance. The existing dashboard scenes remain separate.

## Source

Imported from `TonySama-BoiledCabbage/Soraine_Nasa-Space-App`, branch `frontend/soraine-store`, commit `5989aaa4efc5951d265cbb137ff7b596bbad6a7e`. The isolated copy includes the kitchen app, its models, textures, vendor licences and flat research snapshot. Its assets total about 21 MB on disk and are requested only when the library opens. Actual transfer depends on caching and the scene's asset loading.

## Shared basket

- `library-host.mjs` opens the modal and registers the adapter with `material-library-bridge.mjs`.
- `library/kitchen/host-connection.mjs` accepts a small set of commands only from the same-origin parent window. Commands are serialized.
- `library/kitchen/library-adapter.mjs` maps the nine research IDs to Tony's catalogue.
- Search selections made before opening the shelf transfer once. An existing sample is not duplicated by transfer.
- Research counts distinct materials. The shelf counts physical samples. Removing from research removes one carried sample, leaving other copies and released worktop samples intact.

The basket lives in memory for the current page session. Reloading resets it.

## Research and science

The library uses `/api/research` on the same host. Delivery metadata distinguishes BigQuery records, a stale cache and the saved snapshot. If the API fails, the bundled flat snapshot is used with a visible label. The 59 evidence rows and citations are unchanged. Model-derived values retain that qualification. Shelf products are visual representations of materials, not claims that those manufactured objects were tested. Animated physics is illustrative.

## Verification

Run `node --test test/*.test.mjs` from `dashboard/`. The integration adds basket semantics and provenance tests. Chromium UI checks covered the nine-item shelf, Nomex and Ultem product views, adding two Nomex samples, removing exactly one through search, retained state on reopening, transfer of an Ultem selection from search, and checkout to the lab. Layout checks used desktop, 390px and 320px widths. Physical-device performance and Safari remain separate checks.

Future updates to Tony's app should be applied to the isolated copy while preserving the adapter, host connection, relative API URL, delivery labels, top-level research link, and paused render loop.
