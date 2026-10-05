"""Build a brain pack: everything the page needs to run one raised brain.

A pack is a folder under ``web/brains/``: the Cadence wheel the brain was raised on, the
brain host sources of that day, the life file, the atlas for the brain view and a manifest
that names them. The page boots whichever pack a life was born from, so a newer Cadence
release becomes a new pack beside the old ones, and an existing pet keeps the build it grew
up with.

Usage:
  python tools/pack.py --id mochi-0.74.0-a --name "Basic Mochi" --life runs/boot/basic.life
  python tools/pack.py --id dev-untrained --name "Untrained" --fresh       # a brain that knows nothing
  python tools/pack.py --id mochi-0.74.0-a --default                       # only switch the default
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAINS = ROOT / "web" / "brains"
SOURCES = ["__init__.py", "anatomy.py", "stores.py", "life.py", "host.py", "atlas.py"]
PYODIDE = "314.0.7"
PROTOCOL = 1


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_index(default: str | None = None) -> dict:
    index_path = BRAINS / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"default": None, "packs": []}
    packs = []
    for manifest_path in sorted(BRAINS.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text())
        packs.append({key: manifest[key] for key in ("id", "name", "cadence", "created", "neurons", "synapses", "raised")})
    index["packs"] = packs
    known = {pack["id"] for pack in packs}
    if default:
        index["default"] = default
    if index.get("default") not in known:
        index["default"] = packs[-1]["id"] if packs else None
    index_path.write_text(json.dumps(index, indent=1) + "\n")
    return index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--name", default="")
    parser.add_argument("--life", default="")
    parser.add_argument("--fresh", action="store_true", help="pack an untrained brain")
    parser.add_argument("--genes", default="", help="genes of a fresh brain, as JSON")
    parser.add_argument("--wheel", default="", help="the Cadence wheel; default: the one in web/vendor")
    parser.add_argument("--receipt", default="", help="a JSON file summarising how the brain was raised")
    parser.add_argument("--notes", default="")
    parser.add_argument("--default", action="store_true", help="make this pack the one new lives start from")
    args = parser.parse_args()

    folder = BRAINS / args.id
    if not args.life and not args.fresh:
        if not (folder / "manifest.json").exists():
            raise SystemExit("give --life or --fresh for a new pack")
        print(json.dumps(write_index(args.id if args.default else None), indent=1))
        return

    warnings.simplefilter("ignore")
    import cadence

    from mochi.host import Host

    spec = json.loads((ROOT / "mochi" / "spec.json").read_text())
    host = Host()
    if args.fresh:
        host.handle({"op": "boot", "spec": spec, "genes": json.loads(args.genes) if args.genes else None, "seed": 1})
        life_bytes = host.life.save_bytes()
    else:
        life_bytes = Path(args.life).read_bytes()
        host.handle({"op": "boot", "spec": spec, "path": str(Path(args.life).resolve())})
    report = host.life.report()
    atlas = host.handle({"op": "atlas"})

    vendor = ROOT / "web" / "vendor"
    wheels = sorted(vendor.glob(f"cadence_net-{cadence.__version__}-*.whl"))
    if not wheels and not args.wheel:          # the pure-Python wheel of the installed release, from PyPI
        import subprocess
        import sys

        vendor.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, "-m", "pip", "download", f"cadence-net=={cadence.__version__}", "--no-deps", "-d", str(vendor), "-q"], check=True)
        wheels = sorted(vendor.glob(f"cadence_net-{cadence.__version__}-*.whl"))
    wheel = Path(args.wheel) if args.wheel else (wheels[0] if wheels else None)
    if wheel is None or not wheel.exists():
        raise SystemExit(f"no wheel for cadence-net {cadence.__version__}")

    if folder.exists():
        shutil.rmtree(folder)
    (folder / "py").mkdir(parents=True)
    for name in SOURCES:
        shutil.copy2(ROOT / "mochi" / name, folder / "py" / name)
    shutil.copy2(wheel, folder / wheel.name)
    (folder / "basic.life").write_bytes(life_bytes)
    (folder / "atlas.json").write_text(json.dumps(atlas))
    manifest = {
        "schema": "mochi-brain-pack/1",
        "id": args.id,
        "name": args.name or args.id,
        "created": time.strftime("%Y-%m-%d", time.gmtime()),
        "protocol": PROTOCOL,
        "cadence": cadence.__version__,
        "wheel": wheel.name,
        "wheel_sha256": sha256(wheel),
        "pyodide": PYODIDE,
        "sources": SOURCES,
        "sources_sha256": {name: sha256(folder / "py" / name) for name in SOURCES},
        "life": "basic.life",
        "life_sha256": hashlib.sha256(life_bytes).hexdigest(),
        "atlas": "atlas.json",
        "spec": spec,
        "genes": report["genes"],
        "neurons": report["neurons"],
        "synapses": report["synapses"],
        "regions": report["regions"],
        "raised": json.loads(Path(args.receipt).read_text()) if args.receipt else ({"untrained": True} if args.fresh else {}),
        "notes": args.notes,
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    index = write_index(args.id if args.default else None)
    size = sum(path.stat().st_size for path in folder.rglob("*") if path.is_file())
    print(f"packed {args.id}: {report['neurons']} neurons, {report['synapses']} synapses, {size / 1e6:.1f} MB; default pack: {index['default']}")


if __name__ == "__main__":
    main()
