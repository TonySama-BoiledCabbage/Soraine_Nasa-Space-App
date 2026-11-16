"""Validate the joins the browser makes between scenarios, page scripts and assets."""
import json
from pathlib import Path
import re

REQUIRED_FLAME = {"height", "width", "blue", "sphere", "flicker"}
ALLOWED_SRC = {"schematic", "unverified"}

def validate(source):
    root = Path(source)
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    data = json.loads((root / "data/scenarios.json").read_text(encoding="utf-8"))
    scenarios = data["scenarios"]
    slugs = [s["slug"] for s in scenarios]
    require(scenarios and len(set(slugs)) == len(slugs), "Scenario slugs must be unique")
    require("earth" in slugs, "An 'earth' scenario is required as the initial state")
    for s in scenarios:
        require(re.fullmatch(r"[a-z0-9_]+", s["slug"]), f"Invalid slug: {s['slug']}")
        require(isinstance(s["g"], (int, float)) and s["g"] >= 0, f"{s['slug']}: g must be a non-negative number")
        for key in ("sky", "horizon", "sun"):
            require(len(s[key]) == 3 and all(0 <= v <= 1 for v in s[key]), f"{s['slug']}: {key} must be 3 floats in 0..1")
        require(0 <= s["sunElev"] <= 90 and 0 <= s["sunAz"] < 360, f"{s['slug']}: sun angles out of range")
        require(set(s["flame"]) == REQUIRED_FLAME, f"{s['slug']}: flame needs exactly {sorted(REQUIRED_FLAME)}")
        require(all(0 <= v <= 2 for v in s["flame"].values()), f"{s['slug']}: flame values out of 0..2")
        require(0 < s["fogNear"] < s["fogFar"], f"{s['slug']}: fogNear must be below fogFar")
        T = s.get("terrain")
        if T:
            model = root / T["model"]
            require(model.is_file(), f"{s['slug']}: terrain model missing: {T['model']}")
            with model.open("rb") as fh:
                require(fh.read(4) == b"glTF", f"{s['slug']}: terrain model is not a GLB")
            require(len(T["offset"]) == 3 and T.get("src"), f"{s['slug']}: terrain needs offset [x,y,z] and a src credit")
            require(T.get("kind", "mesh") in ("mesh", "meadow"), f"{s['slug']}: unknown terrain kind")
        for f in s["facts"]:
            require({"k", "v", "src"} <= set(f) and f["src"], f"{s['slug']}: every fact needs k, v and a non-empty src")
    # every script the page loads, and every relative import, must exist
    html = (root / "index.html").read_text(encoding="utf-8")
    for ref in re.findall(r"""(?:href|src)=["']((?:kitchen|vendor|data)/[^"'?]+)""", html):
        require((root / ref).is_file(), f"index.html references missing {ref}")
    for ref in re.findall(r'"[\w-]+":\s*"\./(vendor/[^"]+)"', html):
        require((root / ref).is_file(), f"import map points at missing {ref}")
    for script in (root / "kitchen").glob("*.js"):
        text = script.read_text(encoding="utf-8")
        for ref in re.findall(r"""(?:from\s+|import\s*\(\s*)['"](\.[^'"?]+)""", text):
            require((script.parent / ref).is_file(), f"{script.name} imports missing {ref}")
        # literal asset paths (models, textures, data) must ship with the page
        for ref in re.findall(r"""['"`]((?:models|textures|dashboard/data|data)/[\w./-]+\.(?:glb|png|jpg|json))['"`]""", text):
            require((root / ref).is_file(), f"{script.name} references missing asset {ref}")
    validate_shelf(root, require)
    return len(scenarios)


def validate_shelf(root, require):
    """SORAINE shelf: every research record maps to exactly one product, and every product id is unique."""
    catalog = root / "kitchen/catalog.js"
    research = root / "dashboard/data/research.json"
    if not catalog.is_file():
        return
    text = catalog.read_text(encoding="utf-8")
    ids = re.findall(r"\{\s*id:\s*'([\w-]+)'", text)
    lists = [re.findall(r"'(E\d{3})'", block) for block in re.findall(r"measurementIds:\s*\[([^\]]*)\]", text)]
    require(len(ids) == len(set(ids)) and len(ids) == len(lists), "catalog.js: product ids must be unique, one measurementIds list each")
    used = [m for block in lists for m in block]
    rows = json.loads(research.read_text(encoding="utf-8"))["evidence"]
    known = {r["measurement_id"] for r in rows}
    require(len(used) == len(set(used)), "catalog.js: a measurement_id is mapped to more than one product")
    require(set(used) == known, f"catalog.js: unmapped {sorted(known - set(used))}, unknown {sorted(set(used) - known)}")
    for url in re.findall(r"url:\s*'([\w./-]+\.glb)'", text):
        require((root / url).is_file(), f"catalog.js: model missing {url}")
