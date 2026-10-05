// Boot a brain pack under Pyodide in Node (the engine a browser worker runs) and time it.
// Usage: node tools/pyodide_pack.mjs [pack-id] [ticks]
import { loadPyodide } from "pyodide";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { World, TICK_STEPS } from "../web/js/world.js";
import { sense } from "../web/js/senses.js";
import { SPEC } from "../web/js/spec.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(readFileSync(join(root, "web/brains/index.json"), "utf8"));
const packId = process.argv[2] || index.default, ticks = Number(process.argv[3] || 40);
const pack = join(root, "web/brains", packId);
const manifest = JSON.parse(readFileSync(join(pack, "manifest.json"), "utf8"));
const clock = () => performance.now();
let t = clock();
const lap = label => { const now = clock(); console.log(`${label}: ${(now - t).toFixed(0)} ms`); t = now; };

const pyodide = await loadPyodide();
await pyodide.loadPackage("numpy", { messageCallback: () => {} });
lap("python and numpy");
pyodide.unpackArchive(new Uint8Array(readFileSync(join(pack, manifest.wheel))), "wheel");
pyodide.FS.mkdirTree("/home/pyodide/mochi");
for (const name of manifest.sources) pyodide.FS.writeFile("/home/pyodide/mochi/" + name, readFileSync(join(pack, "py", name), "utf8"));
pyodide.runPython(`
import sys, warnings
warnings.simplefilter("ignore")
sys.path.insert(0, "/home/pyodide")
from mochi.host import Host
_host = Host()
`);
const handle = pyodide.globals.get("_host").handle_json;
const call = message => { const out = JSON.parse(handle(JSON.stringify(message))); if (out.error) throw new Error(out.error); return out; };
lap("cadence and the host");
pyodide.FS.writeFile("/tmp/in.life", new Uint8Array(readFileSync(join(pack, manifest.life))));
const boot = call({ op: "boot", spec: SPEC, path: "/tmp/in.life" });
lap(`boot from the life file (${boot.report.neurons} neurons)`);

const world = new World({ seed: 5, tod: 0.1 });
world.spawnToy("ball", 300, 420);
const times = { routine: [], aroused: [], frames: [], guided: [] }, sweeps = {};
for (let i = 0; i < ticks; i++) {
  const outcome = world.takeOutcome();
  const obs = Array.from(sense(world), v => Math.round(v * 1e4) / 1e4);
  const kind = i % 4 === 0 ? "aroused" : i % 4 === 1 ? "frames" : i % 4 === 2 ? "guided" : "routine";
  const message = { op: "tick", obs: [obs], reward: [outcome.reward], aroused: kind !== "routine", want: { policy: true, learning: true } };
  if (kind === "frames") message.want.frames = 12;
  if (kind === "guided") { message.guide = [3]; message.margin = 2; }
  const start = clock();
  const answer = call(message);
  times[kind].push(clock() - start);
  (sweeps[kind] ||= []).push(answer.sweeps);
  world.setAction(answer.refused ? 0 : answer.action[0]);
  for (let s = 0; s < TICK_STEPS; s++) world.step();
}
const median = list => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
for (const [kind, list] of Object.entries(times)) console.log(`${kind} tick: median ${median(list).toFixed(0)} ms, worst ${Math.max(...list).toFixed(0)} ms, sweeps ${median(sweeps[kind])}`);
// the engine alone: one greedy settle of the live brain, without the host around it
pyodide.runPython(`
import time, numpy as np
_b = _host.life.brain
_x = np.random.default_rng(0).random((1, ${SPEC.inputs})) * (np.random.default_rng(1).random((1, ${SPEC.inputs})) < 0.14)
_t = []
for _ in range(12):
    _x = np.clip(_x + 0.02, 0, 1) * (_x > 0)
    _s = time.perf_counter(); _b.act(_x, greedy=True); _t.append((time.perf_counter() - _s) * 1e3)
print("engine act alone: median %.0f ms, sweeps %d" % (sorted(_t)[6], _b.last_settlement["steps"]))
`);
t = clock(); call({ op: "probe", obs: [Array.from(sense(world))] }); lap("probe");
const saved = call({ op: "save", path: "/tmp/out.life" }); lap(`save (${(saved.bytes / 1e6).toFixed(1)} MB)`);
call({ op: "atlas" }); lap("atlas");
