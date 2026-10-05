"""Build what gets deployed: the static app, a brain pack archive, and a Lovable project.

  dist/mochi/                 the whole app as static files, with the chosen brain packs inside
  dist/mochi-app.zip          the same folder, zipped (drop it into any static host)
  dist/brain-<id>.zip         one brain pack on its own (to add or swap a brain later)
  dist/lovable/               a small Vite + React + TypeScript project that serves the app
                              from public/mochi/ and shows it full-screen
  dist/mochi-lovable.zip      that project, zipped
  dist/SHA256SUMS

Usage: python tools/bundle.py [--packs mochi-0.74.0-a,...] [--default mochi-0.74.0-a]
The page needs no build step: every file is served as written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DIST = ROOT / "dist"

PACKAGE = {
    "name": "mochi-lovable",
    "private": True,
    "version": "0.1.0",
    "type": "module",
    "scripts": {"dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview"},
    "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1"},
    "devDependencies": {
        "@types/react": "^18.3.3", "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.1",
        "typescript": "^5.5.3", "vite": "^5.4.1",
    },
}
INDEX_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mochi</title>
  </head>
  <body style="margin:0">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"""
MAIN_TSX = """import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
"""
APP_TSX = """// Mochi is a self-contained static app in public/mochi/. This page shows it full-screen.
// Keep it in an iframe: the app owns its own worker, canvas and saved lives.
export default function App() {
  return (
    <iframe
      title="Mochi"
      src="/mochi/index.html"
      allow="autoplay"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
"""
VITE_CONFIG = """import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
"""
TSCONFIG = {
    "compilerOptions": {
        "target": "ES2020", "useDefineForClassFields": True, "lib": ["ES2020", "DOM", "DOM.Iterable"],
        "module": "ESNext", "skipLibCheck": True, "moduleResolution": "bundler", "allowImportingTsExtensions": True,
        "isolatedModules": True, "noEmit": True, "jsx": "react-jsx", "strict": True,
    },
    "include": ["src"],
}


def zip_folder(folder: Path, target: Path, prefix: str) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive.write(path, f"{prefix}/{path.relative_to(folder)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packs", default="", help="pack ids to include, comma separated; default: all but dev packs")
    parser.add_argument("--default", default="", help="the pack new lives start from; default: the index's own")
    args = parser.parse_args()

    index = json.loads((WEB / "brains" / "index.json").read_text())
    known = [pack["id"] for pack in index["packs"]]
    chosen = [p for p in args.packs.split(",") if p] or [p for p in known if not p.startswith("dev-")] or known
    for pack in chosen:
        if pack not in known:
            raise SystemExit(f"no such pack: {pack} (have {known})")
    default = args.default or (index["default"] if index["default"] in chosen else chosen[-1])

    if DIST.exists():
        shutil.rmtree(DIST)
    app = DIST / "mochi"
    app.mkdir(parents=True)
    for name in ("index.html", "style.css", "worker.js"):
        shutil.copy2(WEB / name, app / name)
    shutil.copytree(WEB / "js", app / "js")
    (app / "brains").mkdir()
    for pack in chosen:
        shutil.copytree(WEB / "brains" / pack, app / "brains" / pack)
    bundle_index = {"default": default, "packs": [pack for pack in index["packs"] if pack["id"] in chosen]}
    (app / "brains" / "index.json").write_text(json.dumps(bundle_index, indent=1) + "\n")
    shutil.copy2(ROOT / "LICENSE", app / "LICENSE")
    zip_folder(app, DIST / "mochi-app.zip", "mochi")
    for pack in chosen:
        zip_folder(app / "brains" / pack, DIST / f"brain-{pack}.zip", pack)

    lovable = DIST / "lovable"
    (lovable / "src").mkdir(parents=True)
    shutil.copytree(app, lovable / "public" / "mochi")
    (lovable / "package.json").write_text(json.dumps(PACKAGE, indent=2) + "\n")
    (lovable / "index.html").write_text(INDEX_HTML)
    (lovable / "src" / "main.tsx").write_text(MAIN_TSX)
    (lovable / "src" / "App.tsx").write_text(APP_TSX)
    (lovable / "vite.config.ts").write_text(VITE_CONFIG)
    (lovable / "tsconfig.json").write_text(json.dumps(TSCONFIG, indent=2) + "\n")
    shutil.copy2(ROOT / "docs" / "LOVABLE.md", lovable / "LOVABLE.md")
    zip_folder(lovable, DIST / "mochi-lovable.zip", "mochi-lovable")

    sums = []
    for path in sorted(DIST.glob("*.zip")):
        sums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
    (DIST / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    size = lambda p: f"{p.stat().st_size / 1e6:.1f} MB"
    print(f"default pack: {default}; packs: {chosen}")
    for path in sorted(DIST.glob("*.zip")):
        print(f"  {path.relative_to(ROOT)}  {size(path)}")


if __name__ == "__main__":
    main()
