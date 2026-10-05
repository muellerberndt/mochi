# Build your own creature

Mochi is meant to be forked. The page is plain files, the world is one JavaScript module, the
brain host is a few hundred lines of Python on top of the
[Cadence](https://github.com/muellerberndt/cadence) library, and everything that raised the
packaged brain is in this repository. This guide says what to change for what, from a new coat
of paint to a creature with other senses and a brain you raised yourself.

## Set up

```sh
git clone https://github.com/<you>/mochi && cd mochi
python3 serve.py                        # play: http://127.0.0.1:8777/
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
npm install                             # only for the Pyodide timing tool
npm test && .venv/bin/python -m pytest -q tests
.venv/bin/pip install playwright && .venv/bin/playwright install chromium   # only for tools/check_page.py
```

Playing needs nothing but Python's standard library to serve the files. Raising a brain needs
Node 18 or later and the virtual environment.

## Level 1: change how it looks and sounds

No brain is involved; reload the page to see the change.

| What | Where |
| --- | --- |
| The coat (colours, line, cheeks, eyes) | `COAT` in `web/js/render.js` |
| The body's drawing and poses | `drawMochi` in `web/js/render.js` |
| The room, the furniture, the toys, the treats | `drawRoom` and its helpers in `web/js/render.js` |
| Page colours and layout | `web/style.css`, `web/index.html` |
| Voice and sounds | `web/js/audio.js` |
| The brain view's look | the options in `setAtlas`, `web/js/brainview.js` |
| Diary lines, the "Things to try" list | `handleEvents` and `TODO` in `web/js/game.js` |

## Level 2: change the world, keep the body

These change what happens to the creature while its senses and actions stay the same, so the
packaged brain still fits. It will meet situations it was not raised in, and it will learn
from them as it lives.

| What | Where |
| --- | --- |
| How fast each need rises, how much a meal relieves | `BODY` in `web/js/world.js` |
| What pays and what hurts | `REWARD` and `EMPHASIS` in `web/js/world.js` |
| Where the furniture stands, the sun's path | `FURNITURE`, `SUN` in `web/js/world.js` |
| New toys and treats | `TOY_KINDS`, `FLAVORS` and `stepToys` in `web/js/world.js` |
| When Mochi counts as aroused | `AROUSAL` in `web/js/arousal.js` |
| The length of a day | `daySeconds` of `World` |

After a change, count what the packaged brain does in the new world:

```sh
node sim/assay.mjs --policy frozen --life web/brains/mochi-0.74.0-a/basic.life --days 3 --seeds 5
node sim/assay.mjs --policy random --days 3 --seeds 5      # the baseline for every claim
node sim/assay.mjs --policy mother --days 3 --seeds 5      # the teacher, the upper reference
```

## Level 3: change the body, raise a new brain

A brain is raised for one body. If you add a sense, an action or a need, the packaged brain no
longer fits and the page says so at start. Then you raise your own.

1. **Declare the body.** Senses and actions are listed in `web/js/spec.js`. Fill a new sense in
   `web/js/senses.js`, give a new action its effect in `World.step` in `web/js/world.js`, and run
   `node sim/export_spec.mjs` so the Python side reads the same declaration
   (`mochi/spec.json`; a test keeps the two equal).
2. **Teach the mother.** `web/js/mother.js` is a scripted creature that knows the room and
   shows the day. Let her decide from what the creature itself can sense wherever possible; a
   rule that depends on something no sense carries cannot be learned. Check her day:
   `node sim/mother_day.mjs 3`.
3. **Raise.** A litter of pups shares one brain. The mother moves them first, then they move
   themselves while she corrects, in turns of holding back and correcting:

   ```sh
   node sim/bootstrap.mjs --out runs/mine --streams 32 --guided 4000 --weaning 16000 \
        --alone 150 --together 150 --genes '{"layout":"compose","first":0,"association":512,"dentate":0,"temperature":0.1,"teach_eta":0.5,"trace_amplitude":0.3}'
   ```

   The run uses one core; the packaged brain's 20,000 ticks took fifteen minutes on an AWS
   c7i. The log prints the pups' agreement with the mother by kind of action, scored before
   each lesson.
4. **Count what it does on its own.** Agreement while the mother corrects says little. The
   frozen brain living alone for days is the test:

   ```sh
   node sim/assay.mjs --policy frozen --life runs/mine/basic.life --days 3 --seeds 5
   node sim/assay.mjs --policy brain  --life runs/mine/basic.life --days 3 --seeds 5
   node sim/scenarios.mjs --scenario teach --life runs/mine/basic.life --lessons 10
   ```

5. **Pack it.** A pack carries the Cadence wheel, the brain host of that day, the life file and
   a manifest with the body it was raised for:

   ```sh
   .venv/bin/python tools/pack.py --id mine-0.74.0-a --name "My creature" --life runs/mine/basic.life --default
   ```

   Reload the page. New pets hatch from your pack; pets saved from another pack keep theirs.

## Level 4: change the brain

`mochi/anatomy.py` builds the brain from genes. Every designed constant is a gene with a
founder value, and the simpler setting stays available as the control.

- **Size.** `association` is the width of the one processing region. `first` adds a second
  region in front of it.
- **Layout.** `layout: "modality"` gives every sense its own cortical area around one hub;
  `dentate` adds a region of sparse conjunction cells. Both are measured in
  [STATUS.md](../STATUS.md).
- **Memory.** `trace_amplitude` and `trace_decay` set the working trace;
  `memory_expansion` puts a pattern separator in front of the associative store;
  `sleep_transfer` sets what a night keeps.
- **Learning.** `teach_eta`, `teach_margin`, `temperature` for lessons; `reward_eta`,
  `gamma`, `lam` for reward.

Compare settings on recorded days before you spend a bootstrap on one:

```sh
node sim/dataset.mjs --out runs/dataset --streams 32 --ticks 8000
.venv/bin/python tools/sweep.py --data runs/dataset --arms tools/arms_b.json --out runs/sweep --jobs 8
```

`tools/sweep.py` scores each arm's own free answer against the mother before any lesson, next
to two backprop learners on the same stream as matched baselines.

The rules that keep a fork a Cadence creature are in [AGENTS.md](../AGENTS.md): one brain and
one settlement per decision, the world supplies problems and never answers, feedback belongs to
the action the body executed, and every claim is a count against a random walker.

## A newer Cadence

A new library release means a new pack next to the old ones.

```sh
.venv/bin/pip install cadence-net==0.75.0
.venv/bin/python -m pytest -q tests                     # the host's contracts on the new release
node sim/bootstrap.mjs --out runs/next ...              # raise on it
.venv/bin/python tools/pack.py --id mochi-0.75.0-a --name "Basic Mochi" --life runs/next/basic.life --default
```

`tools/pack.py` fetches the matching wheel and copies the host sources into the pack, so the
page runs each pet on the Cadence release and the host it was born with.

## Put it online

The page is static. `python tools/bundle.py` writes `dist/mochi/` (the app with its packs),
the same as an archive, each pack as its own archive, and a small Vite project for Lovable.
Copy `dist/mochi/` to any static host: GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket.
The host has to serve the files as they are and let the page reach `cdn.jsdelivr.net`, where the
worker fetches Pyodide and NumPy. [LOVABLE.md](LOVABLE.md) has the steps for a Lovable project.

A fork can also be embedded with one file. [lovable/index.html](lovable/index.html) loads the
app and the brains of a public repository through the jsDelivr CDN: put your own
`<user>/<repository>@<tag>` in its `MOCHI` line, push the tag, and copy the file to any site.

## Licence

Mochi is MIT licensed. Do what you like with a fork and keep the notice. The Cadence wheel
inside a brain pack is the unmodified library under its own GPL-3.0 licence.
