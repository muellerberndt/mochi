"""Install brain packs into web/brains/.

The default pack ships in the repository. This tool adds others: a pack someone shared as an
archive (`tools/bundle.py` writes one per pack), or the packs listed in an optional
`brains.json` catalogue with their archive name, checksum and download address.

  python tools/brains.py install --from brain-mochi-0.75.0-a.zip
  python tools/brains.py install                 # every pack in brains.json
  python tools/brains.py list

An archive on GitHub Releases of a private repository is fetched with the `gh` CLI; any other
address with a plain download.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAINS = ROOT / "web" / "brains"
CATALOG = ROOT / "brains.json"


def catalog() -> dict:
    return json.loads(CATALOG.read_text()) if CATALOG.exists() else {"default": None, "packs": []}


def write_index(default: str | None) -> dict:
    packs = []
    for manifest_path in sorted(BRAINS.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text())
        packs.append({key: manifest[key] for key in ("id", "name", "cadence", "created", "neurons", "synapses", "raised")})
    known = [pack["id"] for pack in packs]
    if default not in known:
        default = next((p for p in reversed(known) if not p.startswith("dev-")), known[-1] if known else None)
    index = {"default": default, "packs": packs}
    (BRAINS / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    return index


def fetch(entry: dict) -> bytes:
    url = entry["url"]
    if "github.com" in url and "/releases/download/" in url:
        owner_repo = url.split("github.com/")[1].split("/releases/")[0]
        tag = url.split("/releases/download/")[1].split("/")[0]
        try:
            done = subprocess.run(["gh", "release", "download", tag, "--repo", owner_repo, "--pattern", entry["zip"], "--output", "-"],
                                  check=True, capture_output=True)
            return done.stdout
        except (OSError, subprocess.CalledProcessError):
            pass                                  # no gh, or a public release: fall through to a plain download
    with urllib.request.urlopen(url) as response:
        return response.read()


def unpack(data: bytes, expect: str | None) -> str:
    digest = hashlib.sha256(data).hexdigest()
    if expect and digest != expect:
        raise SystemExit(f"checksum mismatch: {digest} is not {expect}")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        pack = names[0].split("/")[0]
        if not all(name.startswith(pack + "/") for name in names) or f"{pack}/manifest.json" not in names:
            raise SystemExit("not a brain pack archive")
        target = BRAINS / pack
        if target.exists():
            shutil.rmtree(target)
        BRAINS.mkdir(parents=True, exist_ok=True)
        archive.extractall(BRAINS)
    return pack


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["install", "list"])
    parser.add_argument("--from", dest="source", default="", help="a brain pack archive on disk")
    parser.add_argument("--id", default="", help="install only this pack from brains.json")
    args = parser.parse_args()
    listing = catalog()
    if args.command == "list":
        installed = {p.parent.name for p in BRAINS.glob("*/manifest.json")}
        for entry in listing["packs"]:
            mark = "installed" if entry["id"] in installed else "not installed"
            print(f"{entry['id']:24s} Cadence {entry['cadence']:8s} {mark:14s} {entry['url']}")
        for extra in sorted(installed - {e["id"] for e in listing["packs"]}):
            print(f"{extra:24s} local only")
        return
    if args.source:
        pack = unpack(Path(args.source).read_bytes(), None)
        print(f"installed {pack} from {args.source}")
    else:
        wanted = [e for e in listing["packs"] if not args.id or e["id"] == args.id]
        if not wanted:
            sys.exit("nothing to install: brains.json lists no such pack")
        for entry in wanted:
            pack = unpack(fetch(entry), entry.get("sha256"))
            print(f"installed {pack}")
    index = write_index(listing.get("default"))
    print(f"default pack: {index['default']}; installed: {[p['id'] for p in index['packs']]}")


if __name__ == "__main__":
    main()
