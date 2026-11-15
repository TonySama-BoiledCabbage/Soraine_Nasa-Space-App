# Planet imagery and rendering

The globe uses JavaScript and Three.js 0.160.0 (MIT, included in `dist/vendor/LICENSE-three`). Its day/night blending and atmospheric limb lighting follow the visual ideas in the [Three.js Earth example](https://threejs.org/examples/webgpu_tsl_earth.html). The shader code here is an original WebGL implementation for broad browser support. The reference's Solar System Scope textures are not included.

| Asset | Source and credit | Processing |
|---|---|---|
| `earth.png` | [NASA/Goddard Blue Marble](https://svs.gsfc.nasa.gov/2915/), Reto Stöckli / NASA Earth Observatory | Original 2048 × 1024 NASA PNG |
| `earth-night.png` | [NASA/GSFC Earth at Night](https://svs.gsfc.nasa.gov/2916/); data Marc Imhoff (NASA/GSFC), Christopher Elvidge (NOAA/NGDC); image Craig Mayhew and Robert Simmon (NASA/GSFC) | Original 2048 × 1024 NASA PNG; historical DMSP/OLS composite |
| `moon-lroc.jpg` | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), Lunar Reconnaissance Orbiter / LROC, NASA SVS / Ernie Wright | 2025 4K sRGB color TIFF converted to 4096 × 2048 JPEG 93 |
| `moon-normal.png` | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), LRO / LOLA | Surface normals derived from the 16-pixels-per-degree elevation TIFF, resized to 4096 × 2048; slopes use the 1737.4 km lunar reference radius and latitude-dependent pixel spacing |
| `moon.jpg` | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), LRO / LROC | Original 2K map retained for the lightweight loading fallback |
| `mars-viking.jpg` | [NASA Mars Trek](https://trek.nasa.gov/mars/), Viking VIS / MDIM 2.1 Color Mosaic, NASA/JPL/USGS | 128 JPEG tiles at level 3, 16 columns × 8 rows, assembled without geographic reordering into 4096 × 2048 JPEG 93 |

Original image endpoints:

- Earth: `https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png`
- Night: `https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002916/earthatnight-2048.png`
- Moon: `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg`
- Moon 4K: `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif`
- Moon elevation: `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif`
- Mars metadata: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml`
- Mars tiles: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/3/{row}/{column}.jpg`

These are mapped satellite-image composites, not live orbital footage. The decorative orbital paths, lighting, rotation and atmospheric glow are illustrative. The Moon has no atmospheric halo. The Mars halo is deliberately faint. The Moon uses elevation-derived normal shading; the Viking map includes baked image relief. Neither is a navigable terrain or a prediction of fire behavior. NASA's color maps are prepared for visualization, rather than quantitative surface measurements.

NASA material is reused with source credits under its [image and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). No NASA logo or endorsement is used. Fuselab Creative's [CyberDefend](https://fuselabcreative.com/our-projects/cyberdefend/) informed the dashboard composition; none of its artwork is included.
