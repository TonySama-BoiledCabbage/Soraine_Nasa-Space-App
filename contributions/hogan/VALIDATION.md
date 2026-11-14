# Handoff validation

Checked on 2026-11-14 from the separate GitHub checkout, using Node 24.22.1, pnpm 11.25.0 and isolated Chrome.

| Check | Result |
| --- | --- |
| Frozen-lockfile install | Completed using the existing package cache |
| Shared information validator | Passed across 15 objects, 4 scenes, 22 cases and 89 evidence records |
| Navigator data and selection tests | 5 passed |
| Original runtime JSON SHA-256 | Exact match |
| Full research archive SHA-256 | Matches the original validation report |
| Production build at `/research/` | Passed |
| Desktop/mobile browser checks on that build | 18 passed; no JavaScript runtime errors |
| Moon and Mars iframe handoffs | Passed; cabin settings preserved on return |
| Generated orb video, reduced motion and failed-media fallback | Passed |

The browser checks cover command navigation, evidence selection, source links, JSON download, focus handling, keyboard shortcuts, responsive layout and deep links. The handoff tests confirm that a 30% oxygen scene setting does not change the published 21%/22% Ultem survival endpoints.

Vite reports a large initial JavaScript chunk: approximately 1.06 MB minified, 274 kB gzip. The full runtime research pack and current UI dependencies are bundled together. Splitting the research view for on-demand loading is a follow-up for the combined app, after its routing and layout are chosen.

Ethan's real Moon scene and Johnson's real Mars scene were not present in this checkout. The bridge was tested against the included host example. Final frame rate and camera behavior must be checked once those scenes are connected.

Reproduction commands and optional browser tooling are in [navigator/README.md](navigator/README.md). Browser images and recordings are generated locally in the ignored `navigator/qa` directory.
