# Physical sample inspection

The shelf and table now distinguish a catalogue product from each purchased sample. Two Ultem combs share their research records but have independent animation histories. Clicking a released sample or choosing its numbered entry in Objects zooms to that sample, pauses observation, and shows its own heat and consumed cues. Reset affects only the selected sample.

## Integration

- `basket.js` assigns session-unique `sample-N` IDs when a body is created. IDs survive reset and are never reused after removal. The total number of physical samples is limited to 12, including released samples.
- `sample-controller.js` subscribes to basket changes, registers and removes reaction state, and supplies spatial inputs at up to 20 Hz. Marker placement stays frame-smooth. Removal restores the original shared materials and disposes only instance-owned resources.
- `sample-exposure.mjs` is the pure boundary between position and schematic heating. Only released samples receive external heat. Distance to the sample's world-space bounding box drives a bounded proximity cue. This is not radiation, convection, contact heat transfer or an ignition model.
- `reaction-visuals.js` lazily clones materials for heated samples. It preserves shared geometry and textures. A warm tint and one small translucent marker illustrate heating and combustion. No particle system or additional lights are created.
- `inspect.js` keeps the actual sample record. Its menu, previous/next navigation, reset and research link retain the instance identity. Catalogue details remain in the shelf.
- `main.js` shares the pause condition across physics, source budgets, reaction state, wave and animation time. Camera transitions remain active while observing. Hidden tabs and a hidden host iframe do not advance the scene.

The reaction core and profiles come from Ethan's Claude in PR #11. Codex's adapter and inspector changes are on `codex/sample-inspection`.

## Scientific meaning

Heat, consumed amount and oxygen availability are unitless animation inputs. No measured oxygen limit is used as an ignition threshold. The sample oxygen toggle controls an assumed oxygen-fed test volume independently of planetary gravity. Moon and Mars scenery does not supply Earth-like air. The legacy burner is a separate mechanism demonstration; this toggle controls the material samples.

All sample reaction times use the core's common display tuning. Material-specific ignition temperatures, melting points and quantitative gravity laws are not supplied by this feature. Melting and charring remain disabled in the initial profiles. Measured, fitted and model-derived research records retain their original conditions and source links. The everyday objects remain representations of materials, rather than replicas of the tested specimens.

## Checks

Run `node --test test/*.test.mjs` from `dashboard/`. Integration tests use the repository's actual Three.js modules without a GPU. They cover independent instances, unchanged shared materials, pause, cooling, retained damage, individual reset, removal/disposal, fresh replacements, distinct IDs and the total sample limit. Browser checks additionally cover physical selection, zoom, keyboard navigation, research routing and phone layout.
