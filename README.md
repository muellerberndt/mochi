# Mochi

Mochi is a small creature that lives in a browser tab and has a real brain. The brain is one
[Cadence](https://github.com/muellerberndt/cadence) network that keeps running for the whole
life of the pet. It decides what Mochi does several times a second, it learns from what
happens, and you can watch every neuron of it while it works.

Animal brains learn from experience while they keep running. Cadence is built the same way:
its connections change locally, during life, with no separate training phase. Mochi is what
that feels like when you can play with it.

**Thank you, Solana.** The Solana community raised the funds for this project. Mochi wears the
colours of the Solana mark as a thank-you, and everything is here under the MIT licence:
the page, the world, the brain host, the tools that raised the brain, and the raised brain
itself. Fork it and build a creature of your own.

## Run it

```sh
git clone https://github.com/muellerberndt/mochi && cd mochi
python3 serve.py
```

Open <http://127.0.0.1:8777/>. That is all: the page is static files and the raised brain is
in the repository. The brain runs in your browser. A Web Worker loads Python (Pyodide), NumPy
and the unmodified `cadence-net` wheel, then the brain; the first load takes about ten
seconds.

## What you can do

- **Live with it.** Mochi follows a day of its own: it wakes at first light, eats, drinks,
  chases its ball, rests in the sun patch that crosses the floor, comes to your hand, and goes
  to bed at dusk. An empty bowl sends it to the bowl to call for you.
- **Touch it.** Stroke it, pick it up, hold out a cookie, throw the ball, wave the feather,
  wind up the mouse, clap, whistle, rearrange the furniture.
- **Teach it words.** Say a word, hold a move while the word rings, and say Good. After a few
  rounds the word alone gets the move. Mochi starts with no words at all; which sound means
  what is yours to decide.
- **Change its mind.** Praise and "No!" land on what it just did, and what wakes it up is what
  it remembers.
- **Watch it think.** The brain panel shows the whole network with every region named. When
  Mochi answers from routine the brain rests. When something new happens you see the repair
  travel through it, the dopamine signal swing and the lesson being written. At night you
  see a sleeping brain.

The pet saves itself in your browser and wakes up where you left it.

## Make it yours

[docs/BUILD_YOUR_OWN.md](docs/BUILD_YOUR_OWN.md) walks through four levels:

1. **Looks and sounds.** The coat is one constant in `web/js/render.js`.
2. **The world.** Needs, rewards, furniture, toys and the length of a day are tables in
   `web/js/world.js`. The packaged brain keeps working and learns the difference as it lives.
3. **The body.** Add a sense or an action in `web/js/spec.js`, teach the scripted mother,
   and raise a new brain with `sim/bootstrap.mjs`.
4. **The brain.** Size, layout, memory and learning rates are genes in `mochi/anatomy.py`,
   and `tools/sweep.py` compares settings before you spend a bootstrap on one.

Everything that raised the packaged brain runs headless on the same world and brain code as
the page, so what you measure is what you ship.

## The brain

One `Brain.compose` network from the Cadence library: 223 sensory neurons, one association
region of 512 neurons that exchanges signals with a motor cortex of 17 actions, a working
trace for the last moments, an associative store for what an action brought, and reward
learning through eligibility traces and a dopamine signal. That is 1,264 neurons and 393,728
synapses. Every decision settles the whole network together and reads the action from the
settled motor cortex.

Mochi's senses are local and modest. Sight carries colour, direction and distance out to
about half the room, so the bowl across the room is known from memory. Smell carries the
direction and kind of food. Hearing is a small cochlea. Needs, touch, light and a sense of
place complete the sheet. No sense names an object or a goal.

A calm Mochi answers from routine and learns nothing. Praise, pain, company or something new
raise its arousal; an aroused Mochi explores and learns from every outcome. Something you
show it is a lesson for that very moment.

The packaged brain was raised by a scripted mother who shows a litter of pups how a day goes,
corrects a pup only where its own answer disagrees with hers, and in turns holds back so the
pups live with their own answers. On its own, without her:

| Three days, five seeds | Portions a day | Drinks a day | Night asleep | Reward a day |
| --- | ---: | ---: | ---: | ---: |
| Mother (the teacher) | 3.4 | 3.0 | 0.95 | 16.4 |
| Mochi, living and learning | 5.1 | 6.5 | 0.97 | 13.6 |
| A random walker | 0.6 | 0.8 | 0.00 | -9.3 |

[CONCEPT.md](CONCEPT.md) describes the design and every supplied choice.
[STATUS.md](STATUS.md) has all the measurements, including how fast it learns a word and what
is work in progress.

## Brains are swappable

A raised brain ships as a **brain pack**: a folder under `web/brains/` with the Cadence wheel
it was raised on, its Python host, its life file and a manifest. The page lists the installed
packs, starts new pets from the default one, and keeps every saved pet on the pack it was born
from. A new Cadence release becomes a new pack next to the old ones.

```sh
python tools/pack.py --id mochi-0.75.0-a --name "Basic Mochi" --life runs/boot/basic.life --default
python tools/brains.py install --from brain-someone-elses.zip
```

## Put it online

The page needs a static host and nothing else. `python tools/bundle.py` writes `dist/mochi/`
ready to copy to GitHub Pages, Netlify, Cloudflare Pages or a bucket, plus archives and a
small Vite project for Lovable ([docs/LOVABLE.md](docs/LOVABLE.md)).

## Checks

```sh
npm test                                   # the room, the senses, the mother
.venv/bin/python -m pytest -q tests        # the brain host's contracts
python tools/check_page.py                 # the served page, in headless Chromium (needs playwright)
node tools/pyodide_pack.mjs                # the default pack under Pyodide, timed
```

## Layout

| Path | What it holds |
| --- | --- |
| `web/` | The page: room, body, senses, renderer, brain view, worker. Plain ES modules, no build step. |
| `web/brains/` | Installed brain packs and their index. |
| `mochi/` | The Python brain host: anatomy, the life loop, the stores, the message interface. |
| `sim/` | The headless harness: bootstrap, behaviour assay, scenarios. |
| `tools/` | Sweeps, the pack and bundle builders, the page check. |
| `tests/` | Checks for the world and for the brain host. |
| `docs/` | The fork guide and the Lovable deployment steps. |

## Licence

Mochi is MIT licensed: see [LICENSE](LICENSE). The brain viewer in `web/js/brain_scan.js` and
`mochi/atlas.py` comes from the Cadence examples, also MIT. The Cadence library itself is
GPL-3.0; each brain pack carries the unmodified `cadence-net` wheel under that licence so the
page can run it.
