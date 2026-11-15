# Soraine in Rust: plan

**Goal.** One app, all program code in Rust: the research dashboard (soraine.vercel.app) stays the home page and gains a "3D" tab that hosts the kitchen, Moon, Mars and orbit scenes from `soraine-3d/`. The browser side is Rust compiled to WebAssembly; the server is a Rust binary. HTML, CSS and GLSL shader text stay as they are (they are not JavaScript).

**Rule for every stage.** The JavaScript in `dashboard/dist/` stays live and untouched until stage 6. Each ported piece must reproduce the JavaScript's output on the published data before the next piece starts. No citation, record ID, ULOI/MOC value or caveat text changes anywhere.

## Where things are

| Thing | Location |
|---|---|
| Live dashboard (JavaScript) | `dashboard/dist/`, published by Vercel from `codex/mission-control-cloud` on goodenough7000's repo |
| Node server and data contracts | `dashboard/server/` |
| 3D scenes to merge in | `soraine-3d/` on branch `physics-integration` of ethan-gobi's fork |
| Rust workspace | `dashboard/rust/` (this folder) |
| JavaScript reference outputs | `soraine-core/tests/golden.json`, written by `node tools/make-golden.mjs` |

## Stages

- [x] **0. Workspace, research logic and a working browser build.** `soraine-core` ports `data.mjs`, `discovery.mjs`, `reading.mjs` and `scene-link.mjs`; `soraine-web` exposes it to the page as WebAssembly. Checks: `cargo test` (11 tests) matches the JavaScript on all 59 results, 33 filters, the full CSV export, 307 sources and 14 scene links; `node tools/check-web.mjs` gets the same answers from the WebAssembly build running in Chrome.
- [ ] **1. Remaining pure logic into `soraine-core`.** Glossary terms, specimen oxygen-axis maths, the original-data explorer's filter/sort/paging, URL state, and the touch gesture state machine (`touch-orbit.mjs`). Check: extend `make-golden.mjs` and `parity.rs` for each; `cargo test` passes.
- [ ] **2. `soraine-server`.** Rust replacement for `server/*.mjs`: static files, `/api/research`, `/api/original-data`, five-minute cache, ETags. Check: port `test/http.test.mjs`, `test/server.test.mjs` and `test/original-data.test.mjs`; the existing Playwright suite passes against the Rust server.
- [ ] **3. `soraine-web` shell.** WebAssembly front end that renders the five views (overview, original data, compare, evidence, sources) with the same class names, so the current stylesheets and Playwright selectors keep working. Check: `test/browser.mjs` passes against the Rust build; page text matches the JavaScript build view by view.
- [ ] **4. 3D in Rust.** WebGL2 from Rust for the planet (shaders from `planet-materials.mjs`), the orbital laboratory and the material specimen, driven by the gesture code from stage 1. The specimen's glass-like material is the hard part. Check: `test/planets.mjs` passes; screenshots of Earth, Moon, Mars and each specimen are compared with the JavaScript build.
- [ ] **5. The 3D tab.** Port the `soraine-3d` scenes and physics (cannon.js becomes the `rapier3d` crate) into the same renderer as a new `scenes` view, linked both ways with the research views. Check: each scene loads on desktop and at 390px; the flame and objects behave as in `soraine-3d` for all four worlds.
- [ ] **6. Cutover.** Remove the JavaScript, publish the built WebAssembly, and open the pull request against `codex/mission-control-cloud`. Check: all suites pass on the Rust build and on a physical phone.

## Known constraints

- **Building WebAssembly.** GitHub Actions (`.github/workflows/rust.yml`) tests, lints and builds the WebAssembly target on every push to `rust-rewrite`. Locally, `sh tools/build-web.sh` writes the browser package to `pkg/`; where the `wasm32-unknown-unknown` target cannot be installed it builds the standard library from the `rust-src` sources instead. `node tools/check-web.mjs` then runs the package in Chrome.
- **Vercel has no build step today.** Either commit the built `.wasm` into `dist/` or add a build command; decide at stage 3.
- **Download size.** The WebAssembly file is 1.7 MB before any size tuning, most of it Unicode sorting data. Shrink it (size-optimised build, `wasm-opt`, compression) before stage 6 so the phone experience does not regress.

## Do not touch

`dashboard/dist/data/`, `dashboard/source-data/`, the BigQuery scripts, and anything under `contributions/`.
