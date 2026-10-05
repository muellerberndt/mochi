#!/usr/bin/env python3
"""Serve Mochi locally.

    python3 serve.py            # http://127.0.0.1:8777/
    python3 serve.py 9000

The page is static: this is a plain file server for web/ that sends no-cache headers, so a
reload always shows the files as they are on disk. The same files run on any static host.
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB = Path(__file__).resolve().parent / "web"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".wasm": "application/wasm", ".life": "application/octet-stream", ".whl": "application/octet-stream",
        ".py": "text/plain",
    }

    def translate_path(self, path: str) -> str:
        if path.startswith("/web/") or path == "/web":      # the page also answers under /web/
            path = path[4:] or "/"
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - the base class's name
        if args and str(args[1]) not in ("200", "304"):
            super().log_message(format, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    if not (WEB / "brains" / "index.json").exists():
        sys.exit("web/brains/index.json is missing: no brain pack is installed. See tools/pack.py and tools/brains.py.")
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(WEB)))
    print(f"Mochi is at http://127.0.0.1:{port}/  (Ctrl-C stops the server)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
