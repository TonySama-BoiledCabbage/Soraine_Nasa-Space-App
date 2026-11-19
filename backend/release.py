from pathlib import Path
import re
import shutil
import tempfile
from .contracts import validate

# Explicit public-asset allowlist. Add every new runtime file here or it will be missing online.
FILES = [
    "index.html",
    "kitchen/style.css", "kitchen/main.js", "kitchen/scene.js", "kitchen/wave.js", "kitchen/pages.js", "kitchen/props.js", "kitchen/terrain.js", "kitchen/meadow.js", "kitchen/stars.js",
    "kitchen/combustion.js", "kitchen/motion.js", "kitchen/sfx.js", "kitchen/sound-toggle.js", "sounds/planet-switch.mp3", "sounds/pan-sizzle.mp3", "sounds/oil-drop-1.mp3", "sounds/oil-drop-2.mp3", "sounds/arm-deploy-1.mp3", "sounds/arm-deploy-2.mp3", "sounds/arm-deploy-3.mp3", "sounds/arm-stow.mp3", "sounds/oxygen-hiss.mp3", "sounds/ambience-grass.mp3", "sounds/ambience-wind.mp3", "sounds/cabin-hum.mp3", "sounds/o2-button.mp3", "sounds/fire-loop.mp3", "sounds/hit-wood-1.mp3", "sounds/hit-wood-2.mp3", "sounds/hit-wood-3.mp3", "sounds/hit-hard-1.mp3", "sounds/hit-hard-2.mp3", "sounds/hit-hard-3.mp3", "sounds/hit-hard-4.mp3", "sounds/hit-metal-1.mp3", "sounds/hit-metal-2.mp3", "sounds/hit-metal-3.mp3", "sounds/hit-metal-4.mp3", "sounds/hit-fabric-1.mp3", "sounds/hit-fabric-2.mp3", "sounds/hit-fabric-3.mp3", "sounds/hit-fabric-4.mp3", "kitchen/material-search.css", "kitchen/material-search/catalog.js", "kitchen/material-search/client.js", "kitchen/material-search/bridge.js", "kitchen/material-search/ui.js", "kitchen/research-db.css", "kitchen/research-db/data.js", "kitchen/research-db/glossary.js", "kitchen/research-db/browser.js", "data/research-db/research.json", "data/research-db/original-data.json", "kitchen/inspect.js", "kitchen/inspect.css", "kitchen/object-info.js", "kitchen/materials.js", "kitchen/prop-models.js",
    "kitchen/research-source.js", "kitchen/catalog.js", "kitchen/shop-shapes.js", "kitchen/basket.js", "kitchen/shelf3d.js", "kitchen/shop.js", "kitchen/shop.css",
    "kitchen/material-profiles.js", "kitchen/material-reactions.js", "kitchen/reaction-visuals.js",
    "kitchen/distant-earth.js", "kitchen/button-motion.css",
    # SORAINE store models: listed one by one so retired assets in models/shop/ (the old cart) stay out of releases
    "models/shop/shelf.glb", "models/shop/shopping-basket.glb", "models/shop/nomex-glove.glb", "models/shop/polycarbonate-goggles.glb",
    "models/shop/nomex-velcro-strap.glb", "models/shop/beefy-t-shirt.glb", "models/shop/mylar-sleeve.glb", "models/shop/ultem-comb.glb",
    "models/shop/sibal-cloth.glb", "models/shop/pmma-ruler.glb", "models/shop/p213-tape.glb",
    "vendor/three.module.js", "vendor/LICENSE-three", "vendor/cannon-es.js", "vendor/LICENSE-cannon-es", "vendor/addons/loaders/GLTFLoader.js", "vendor/addons/utils/BufferGeometryUtils.js",
    "data/scenarios.json",
    "dashboard/index.html", "dashboard/style.css", "dashboard/app.js", "dashboard/data/research.json",
]
GLOBS = ["models/*.glb", "models/planet_surfaces/*.glb", "models/landing/*.glb", "models/soraine_props/*.glb", "textures/*.png"]

def _write(source, target, host):
    files = list(FILES)
    if host == "vercel":
        files.append("vercel.json")
    for pattern in GLOBS:
        files.extend(p.relative_to(source).as_posix() for p in source.glob(pattern) if ".before-" not in p.name)
    for rel in files:
        dest = target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / rel, dest)
    # strip development inspection handles from the release only
    main = target / "kitchen/main.js"
    main.write_text(re.sub(r"^window\.__kitchen = .*;\s*$", "", main.read_text(encoding="utf-8"), flags=re.M), encoding="utf-8", newline="\n")
    n = sum(p.is_file() for p in target.rglob("*")); size = sum(p.stat().st_size for p in target.rglob("*") if p.is_file())
    print(f"{n} files; {size:,} bytes")

def prepare(source, target, host="vercel"):
    source, target = Path(source).resolve(), Path(target).resolve()
    if host not in ("vercel", "static"):
        raise ValueError(f"Unknown host: {host}")
    if target.exists():
        raise FileExistsError(target)
    validate(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as staging:
        release = Path(staging) / "site"
        release.mkdir()
        _write(source, release, host)
        validate(release)
        release.rename(target)
