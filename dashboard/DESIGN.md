# Dashboard build target

Primary target: the existing Flame in Freefall kitchen UI and workspace design.md.
Preserve paper #f6f1e7, ink #1d1a16, fire #e8702a, system sans, capsule controls, quiet thin borders and low-poly environment cues. Dashboard text and charts stay crisp rather than pixelated. No animated background, glass HUD or generic KPI grid.

Reference lock: current product owns visual identity; Refero live research returned NO_SUBSCRIPTION. Its bundled typography/craft-details and visual QA references supply focus, readable type, stable media sizing and keyboard/touch behavior. UI UX search returned unrelated recommendations, which were rejected rather than treated as a design authority.

| Decision | Source | Role |
|---|---|---|
| Paper canvas, ink controls, orange data emphasis | kitchen/style.css and design.md | Existing product identity |
| Low-poly environment medallions | Existing planet concept models and design.md | Environment selection, not numerical simulation |
| Material → condition → point → source inspector | design.md and verified warehouse schema | Research task order |
| Discrete data points; no interpolated risk curve | design.md scientific rules | Preserve unknowns and test-criterion differences |
| Separate material limits, spread fits and model estimates | Warehouse evidence_type and units | Prevent incompatible pooling |
| 44px controls, focus-visible, keyboard-selectable points | Bundled craft-details.md | Accessible selection |

Data is a public, checksum-matched snapshot of the warehouse import. This static dashboard does not make authenticated live BigQuery requests. No credentials are delivered to the browser.
