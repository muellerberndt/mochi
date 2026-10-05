# Deploying Mochi in a Lovable project

These instructions are written for the Lovable coding agent. Mochi is a self-contained static
web app: plain HTML, CSS and ES modules with no build step, plus one or more **brain packs**.
Your job is to place its files unchanged under `public/mochi/` and show the app in a
full-screen iframe. Do not rewrite it in React, do not bundle or minify its JavaScript and do
not move files inside the folder: the app loads a Web Worker, Python sources and binary brain
files by relative path.

Everything you need is in the public repository
<https://github.com/muellerberndt/mochi>.

## Where the files are

| What | In the repository | Direct address |
| --- | --- | --- |
| The app | the folder `web/` | `https://raw.githubusercontent.com/muellerberndt/mochi/main/web/<path>` |
| The brain packs | `web/brains/<pack id>/`, listed in `web/brains/index.json` | `https://raw.githubusercontent.com/muellerberndt/mochi/main/web/brains/<pack id>/<file>` |
| The default brain | `web/brains/mochi-0.74.0-a/` | `https://raw.githubusercontent.com/muellerberndt/mochi/main/web/brains/mochi-0.74.0-a/basic.life` |
| The whole repository as one archive | | `https://github.com/muellerberndt/mochi/archive/refs/heads/main.zip` |

The folder `web/` of the repository becomes `public/mochi/` of the Lovable project, file for
file. In the archive that folder is `mochi-main/web/`.

A brain pack is a folder of six kinds of file. For the default pack `mochi-0.74.0-a`:

```text
web/brains/index.json                                   which packs are installed, and the default
web/brains/mochi-0.74.0-a/manifest.json                 what the pack needs and how the brain was raised
web/brains/mochi-0.74.0-a/basic.life                    the raised brain (binary, about 6 MB)
web/brains/mochi-0.74.0-a/atlas.json                    the layout the brain view draws
web/brains/mochi-0.74.0-a/cadence_net-0.74.0-py3-none-any.whl   the Cadence library (binary, 0.3 MB)
web/brains/mochi-0.74.0-a/py/__init__.py
web/brains/mochi-0.74.0-a/py/anatomy.py
web/brains/mochi-0.74.0-a/py/stores.py
web/brains/mochi-0.74.0-a/py/life.py
web/brains/mochi-0.74.0-a/py/host.py
web/brains/mochi-0.74.0-a/py/atlas.py
```

`basic.life` and the `.whl` wheel are binary and must arrive byte for byte. Never open,
re-encode or regenerate them. `manifest.json` carries the SHA-256 of both
(`life_sha256`, `wheel_sha256`).

## Two ways to install

### A. Keep the brains in the repository (no binary file in the Lovable project)

Use this when you cannot store binary files in the project. The app's own files are text; the
brains are fetched by the visitor's browser from the repository through the jsDelivr CDN,
which serves any public GitHub repository with cross-origin access.

1. Copy these text files from `web/` of the repository to `public/mochi/` of the project,
   keeping names and folders:

   ```text
   index.html   style.css   worker.js
   js/arousal.js   js/audio.js   js/brain_scan.js   js/brainlink.js   js/brainview.js
   js/game.js      js/mother.js  js/owner.js        js/render.js      js/senses.js
   js/spec.js      js/storage.js js/world.js
   ```

2. In `public/mochi/index.html`, add this line inside `<head>`:

   ```html
   <meta name="mochi-brains" content="https://cdn.jsdelivr.net/gh/muellerberndt/mochi@main/web/brains/">
   ```

   The app then reads `index.json` and every pack from that address. To pin a fixed version,
   replace `@main` with a release tag or a commit hash.

3. Add the page from "Show the app" below and publish.

### B. Keep everything in the Lovable project

Use this when the project can hold binary files (for example through its GitHub repository).

1. Copy the whole folder `web/` of the repository to `public/mochi/`, including
   `brains/`. From the repository archive that is `mochi-main/web/`.
2. Leave `index.html` as it is: without the meta line the app reads `brains/` beside itself.
3. Add the page from "Show the app" below and publish.

If you cannot download or unpack an archive into the project, use way A, or ask the project
owner to add the folder through the project's GitHub repository.

## Show the app

Add a page that shows the app full-screen, and make it the route you want (the root route in
a fresh project):

```tsx
export default function Mochi() {
  return (
    <iframe
      title="Mochi"
      src="/mochi/index.html"
      allow="autoplay"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
```

If the project already has pages and navigation, add Mochi as its own route (for example
`/mochi`) with this iframe and link to it; leave the rest of the project as it is. Nothing
else is required: no environment variables, no backend, no database, no npm dependency. Do
not add the app's files to the bundler's entry points.

## What the app needs from the host

- **Static file serving of `public/` exactly as written.** Vite copies `public/` verbatim; keep
  it that way. Files ending in `.life`, `.whl` and `.py` are fetched by the app with `fetch`
  and may be served with any content type.
- **Module workers.** The app starts `worker.js` with `new Worker(url, { type: "module" })` from
  the same origin. Do not inline it, do not change its path.
- **Outbound access to `cdn.jsdelivr.net`.** The worker downloads Pyodide (Python compiled to
  WebAssembly) and NumPy from there at start, and in way A the brain packs too. If the project
  sets a Content-Security-Policy, allow `https://cdn.jsdelivr.net` in `script-src`,
  `connect-src` and `worker-src`, and allow `'wasm-unsafe-eval'` in `script-src`.
- **No cross-origin isolation is needed.** The app does not use SharedArrayBuffer; do not add
  COOP or COEP headers for it.
- **IndexedDB** in the visitor's browser holds the saved pet. Nothing is sent to a server.

## Checking the deployment

Open the page. Within about ten seconds the loading card disappears, a creature in violet,
blue and green moves in the room, and the Brain panel on the right shows a glowing brain with
labelled regions. Then:

- The clock in the header advances and the diary at the bottom fills with events.
- Clicking the food bowl refills it; dragging the ball throws it.
- The header shows "saved" with a time after a minute: the pet saves itself.
- The browser console shows no errors.

If the loading card reports that the brain did not start, the usual causes are a blocked
`cdn.jsdelivr.net`, a missing or altered file under `brains/`, a wrong address in the
`mochi-brains` meta line (it must end in `/brains/`), or a build step that renamed or bundled
the files.

## Adding or swapping a brain later

New brains appear in the repository as new folders under `web/brains/`, and
`web/brains/index.json` names the default. In way A the deployed app picks them up from the
repository by itself (pin a tag in the meta line if it should not). In way B copy the new pack
folder to `public/mochi/brains/` and replace `public/mochi/brains/index.json` with the
repository's.

Keep older packs installed: every saved pet remembers the pack it was born from and keeps
running on that pack's Cadence build, so removing a pack strands the pets that use it.

## Local run, for comparison

```sh
git clone https://github.com/muellerberndt/mochi && cd mochi && python3 serve.py
```

Then open `http://127.0.0.1:8777/`. The Lovable deployment must behave the same.
