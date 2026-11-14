# Planet imagery and rendering

The globe uses JavaScript and Three.js 0.160.0 (MIT, included in `dist/vendor/LICENSE-three`). Its day/night blending and atmospheric limb lighting follow the visual ideas in the [Three.js Earth example](https://threejs.org/examples/webgpu_tsl_earth.html). The shader code here is an original WebGL implementation for broad browser support. The reference's Solar System Scope textures are not included.

| Asset | Source and credit | Processing |
|---|---|---|
| `earth.png` | [NASA/Goddard Blue Marble](https://svs.gsfc.nasa.gov/2915/), Reto Stöckli / NASA Earth Observatory | Original 2048 × 1024 NASA PNG |
| `earth-night.png` | [NASA/GSFC Earth at Night](https://svs.gsfc.nasa.gov/2916/); data Marc Imhoff (NASA/GSFC), Christopher Elvidge (NOAA/NGDC); image Craig Mayhew and Robert Simmon (NASA/GSFC) | Original 2048 × 1024 NASA PNG; historical DMSP/OLS composite |
| `moon.jpg` | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), Lunar Reconnaissance Orbiter / LROC | Original 2K color map |
| `mars.jpg` | [NASA Mars Trek](https://trek.nasa.gov/mars/), MGS MOC Atlas Global Color Mosaic, NASA/JPL/MSSS | 32 tiles at level 2, 8 columns × 4 rows, assembled without geographic reordering; JPEG 93 |

Original image endpoints:

- Earth: `https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png`
- Night: `https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002916/earthatnight-2048.png`
- Moon: `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg`
- Mars metadata: `https://trek.nasa.gov/tiles/Mars/EQ/msss_atlas_simp_clon/1.0.0/WMTSCapabilities.xml`
- Mars tiles: `https://trek.nasa.gov/tiles/Mars/EQ/msss_atlas_simp_clon/1.0.0/default/default028mm/2/{row}/{column}.png`

These are mapped satellite-image composites, not live orbital footage. The decorative orbital paths, lighting, rotation and atmospheric glow are illustrative. The Moon has no atmospheric halo. The Mars halo is deliberately faint. Surface images provide context, not a prediction of fire behavior.

NASA material is reused with source credits under its [image and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). No NASA logo or endorsement is used. Fuselab Creative's [CyberDefend](https://fuselabcreative.com/our-projects/cyberdefend/) informed the dashboard composition; none of its artwork is included.
