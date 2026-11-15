# Soraine visual direction

SORAINE is the brand. Flame in Freefall is the project. “Fire safety beyond Earth” connects the planetary setting to the research purpose.

## Layout

Use open sections, generous space and thin dividers. Avoid grids of rounded cards. Let the planet establish the environment while the adjacent material comparison explains why it matters. Keep source links and test conditions beside the results.

The research interface is one part of Soraine. Moon and Mars scenes can open a relevant comparison or evidence record through `dist/scene-link.mjs`. The research module does not own scene cameras, physics or transitions.

## Typography and colour

- DM Sans for controls, data and body text; Instrument Serif italic for the main brand phrase.
- Background: `#0b1012`; primary text: `#edf0e9`; secondary text: `#9aa8a8`.
- Sage accent: `#c6edba`; blue secondary accent: `#a5cddc`.
- Reserve strong colour for the active selection, comparison series and important actions.
- Material icons use the same inline SVG stroke style: polymer block for Ultem, layered film for Mylar, weave for Nomex. Always keep the written material name.

## Motion and devices

Transitions use opacity and translation. Do not add full-screen blur or continuous layout animation. The planet pauses when hidden or outside the viewport. Reduced-motion preferences disable automatic rotation and decorative transitions. Material selection preserves the existing renderer and camera. The camera automatically fits the planet to the available canvas aspect ratio, including narrow desktop panels.

Small screens use a bottom research navigation, stacked sections, larger controls and labelled evidence rows. Horizontal drags rotate the planet; vertical swipes scroll. Small screens load smaller WebP maps; desktop retains the detailed NASA assets. Normal-map vectors are renormalized after resizing.

## Research presentation

Distinguish published limits, fitted results, reported summaries, derived summaries and model-derived values. Show pressure as absolute pressure and retain source units. Lunar and Martian gravity describe the experiments, not outdoor atmospheres. The globe is visual context. It does not calculate flame behaviour.

## References and implementation

The layout study used [The Bluejack Group Dashboard on Awwwards](https://www.awwwards.com/sites/the-bluejack-group-dashboard), particularly its open metric columns and fine rules. [Anthropic’s frontend design article](https://claude.com/resources/articles/improving-frontend-design-through-skills) informed the emphasis on intentional typography, hierarchy and restrained motion. No reference artwork was copied.

The site remains JavaScript, Three.js, HTML and CSS with a Node backend. This pass reduces texture transfer, renderer churn and unnecessary animation. A Rust/Wasm module should be considered only for a measured CPU bottleneck, with a benchmark and an explicit data contract. It would not replace Three.js rendering or improve texture downloads by itself.
