# Deploying Mochi in a Lovable project

These instructions are written for the Lovable coding agent. Mochi is a static web app: plain
HTML, CSS and ES modules with no build step, plus one or more **brain packs** (a raised Cadence
brain with the library it runs on). Everything is in the public repository
<https://github.com/muellerberndt/mochi>.

Your job is small: add one HTML file under `public/mochi/` and show it in a full-screen
iframe. Do not rewrite the app in React, do not retype or regenerate its JavaScript, and do
not add it to the bundler. The app starts a Web Worker, runs Python in WebAssembly and reads
binary brain files; it works when its files arrive unchanged.

## The short way: one file

The file below is the whole installation. It loads the app and the brain packs from the
repository through the jsDelivr CDN, pinned to release `v1.0.0`, and runs them as a page of
the Lovable site. The pet is saved in the visitor's browser under the site's own address.

1. Create `public/mochi/index.html` with exactly this content:

   ```html
   <!doctype html>
   <html lang="en">
   <head>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <title>Mochi</title>
   <script>
   // Mochi, embedded: this one file is all a host needs. It loads the app and its brain packs
   // from the public repository through the jsDelivr CDN, pinned to one release, and runs them
   // as this page, so the pet is saved under this site's own address.
   // To move to a newer release change the tag after "@". To follow the repository use "@main".
   const MOCHI = "https://cdn.jsdelivr.net/gh/muellerberndt/mochi@v1.0.0/web/";
   fetch(MOCHI + "index.html")
     .then(response => { if (!response.ok) throw new Error("HTTP " + response.status); return response.text(); })
     .then(page => { document.open(); document.write(page.replace("<head>", '<head><base href="' + MOCHI + '">')); document.close(); })
     .catch(error => { document.body.textContent = "Mochi could not be loaded from " + MOCHI + " (" + error.message + ")."; });
   </script>
   </head>
   <body style="margin:0;background:#0b0714;color:#c9ffe9;font:16px system-ui,sans-serif;padding:24px"></body>
   </html>
   ```

   The same file is in the repository at `docs/lovable/index.html`
   (<https://raw.githubusercontent.com/muellerberndt/mochi/v1.0.0/docs/lovable/index.html>).

2. Add a page that shows it full-screen, and make it the route you want (the root route in a
   fresh project):

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
   `/mochi`) with this iframe and link to it. Leave the rest of the project as it is.

3. Publish. Nothing else is required: no environment variable, no backend, no database, no npm
   dependency.

## Where the brains are

A brain pack is a folder in the repository under `web/brains/`, and
`web/brains/index.json` lists the installed packs and names the default. The default pack is
`mochi-0.74.0-a`: one Cadence network of 1,264 neurons and 393,728 synapses, raised on
`cadence-net` 0.74.0.

| What | Address |
| --- | --- |
| The pack index | <https://cdn.jsdelivr.net/gh/muellerberndt/mochi@v1.0.0/web/brains/index.json> |
| The default pack, as a folder | <https://github.com/muellerberndt/mochi/tree/v1.0.0/web/brains/mochi-0.74.0-a> |
| The raised brain itself (binary, 6.1 MB) | <https://cdn.jsdelivr.net/gh/muellerberndt/mochi@v1.0.0/web/brains/mochi-0.74.0-a/basic.life> |
| The default pack, as one archive | <https://github.com/muellerberndt/mochi/releases/download/v1.0.0/brain-mochi-0.74.0-a.zip> |
| The app with its packs, as one archive | <https://github.com/muellerberndt/mochi/releases/download/v1.0.0/mochi-app.zip> |

The files of the pack:

```text
web/brains/index.json
web/brains/mochi-0.74.0-a/manifest.json          what the pack needs and how the brain was raised
web/brains/mochi-0.74.0-a/basic.life             the raised brain (binary)
web/brains/mochi-0.74.0-a/atlas.json             the layout the brain view draws
web/brains/mochi-0.74.0-a/cadence_net-0.74.0-py3-none-any.whl   the Cadence library (binary)
web/brains/mochi-0.74.0-a/py/__init__.py  anatomy.py  stores.py  life.py  host.py  atlas.py
```

With the short way you never copy these: the visitor's browser fetches them from the CDN. The
two binary files must always arrive byte for byte; `manifest.json` carries their SHA-256
(`life_sha256`, `wheel_sha256`).

## The self-contained way: copy the app

Use this only if the site must serve every file itself. It needs a way to put binary files
into the project, which usually means the project's GitHub repository:

```sh
git clone --depth 1 --branch v1.0.0 https://github.com/muellerberndt/mochi /tmp/mochi
mkdir -p public && cp -R /tmp/mochi/web public/mochi
```

The folder `web/` of the repository becomes `public/mochi/`, file for file, with `brains/`
inside it. The archive `mochi-app.zip` holds the same folder under the name `mochi/`. Then add
the iframe page from step 2 above. If you cannot run these commands or store binary files, use
the short way.

## What the app needs from the host

- **`public/` served exactly as written.** Vite copies `public/` verbatim; keep it that way.
- **Outbound access to `cdn.jsdelivr.net`** from the visitor's browser. The app's code, the
  brain packs, Pyodide (Python compiled to WebAssembly) and NumPy come from there. If the
  project sets a Content-Security-Policy, allow `https://cdn.jsdelivr.net` in `script-src`,
  `style-src`, `connect-src` and `worker-src`, `blob:` in `worker-src`, `'unsafe-inline'` in
  `script-src` and `style-src`, and `'wasm-unsafe-eval'` in `script-src`.
- **No cross-origin isolation.** The app does not use SharedArrayBuffer; do not add COOP or
  COEP headers for it.
- **IndexedDB** in the visitor's browser holds the saved pet. Nothing is sent to a server.

## Checking the deployment

Open the page. Within about fifteen seconds the loading card disappears, a creature in violet,
blue and green moves in the room, and the Brain panel on the right shows a glowing brain with
labelled regions. Then:

- The clock in the header advances and the diary at the bottom fills with events.
- Clicking the food bowl refills it; dragging the ball throws it.
- The header shows "saved" with a time after about a minute: the pet saves itself.
- After a reload the same pet wakes up where it was.
- The browser console shows no errors.

If the page stays dark with a line saying Mochi could not be loaded, the browser cannot reach
`cdn.jsdelivr.net` or the tag in `MOCHI` does not exist. If the loading card reports that the
brain did not start, a Content-Security-Policy is blocking the worker or WebAssembly, or (in
the self-contained way) a file under `brains/` is missing or altered.

## A newer release or brain

New brains appear in the repository as new folders under `web/brains/`, and a new release tag
is cut with them. To move a deployment forward, change the tag in the `MOCHI` line of
`public/mochi/index.html` (for example `@v1.0.0` to `@v1.1.0`). Saved pets keep the brain they
were born with: every release keeps the older packs, and each pet remembers its pack.

In the self-contained way, copy the new pack folder to `public/mochi/brains/`, replace
`public/mochi/brains/index.json` with the repository's, and keep the older pack folders.

## Local run, for comparison

```sh
git clone https://github.com/muellerberndt/mochi && cd mochi && python3 serve.py
```

Then open `http://127.0.0.1:8777/`. The Lovable deployment must behave the same.
