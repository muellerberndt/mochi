// Raise a basic Mochi: the mother shows the day, then hands the body over.
//
//   guided   the mother moves every body; where the brain's own answer disagrees with hers,
//            her action is the lesson for what the body senses
//   weaning  the brain moves its own body; the mother still corrects each disagreement
//            (--alone N --together M: she holds back for N ticks, then corrects for M, in turns)
//   free     no mother; several litter-mates share the brain, every tick aroused
//
// Agreement with the mother is scored on the brain's own free answer before any lesson.
// Usage: node sim/bootstrap.mjs --out runs/NAME [--streams 16 --guided 1500 --weaning 1500 --free 0
//        --seed 1 --block 250 --genes '{"layout":"compose"}' --from runs/OTHER/basic.life]
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { BrainProcess, ROOT, args } from "./brain_proc.mjs";
import { makeCreature, tick, Tally } from "./harness.mjs";
import { SPEC } from "../web/js/spec.js";

const options = args({ out: "runs/boot", streams: 16, guided: 1500, weaning: 1500, free: 0, seed: 1, block: 250, genes: "", from: "", alone: 0, together: 0 });
const out = join(ROOT, options.out);
mkdirSync(out, { recursive: true });
const genes = options.genes ? JSON.parse(options.genes) : null;
const brain = new BrainProcess();
const started = Date.now();
const boot = await brain.call({ op: "boot", spec: SPEC, genes, seed: options.seed, path: options.from ? join(ROOT, options.from) : undefined });
if (options.from) await brain.call({ op: "streams" });
const { neurons, synapses, regions } = boot.report;
console.log(`brain: ${neurons} neurons, ${synapses} synapses`, JSON.stringify(regions));
writeFileSync(join(out, "run.json"), JSON.stringify({ options, genes: boot.report.genes, neurons, synapses, regions, started: new Date().toISOString() }, null, 1));

const creatures = Array.from({ length: options.streams }, (_, i) => makeCreature(options.seed * 1000 + i));
const tally = new Tally();
let total = 0;
for (const [phase, ticks] of [["guided", options.guided], ["weaning", options.weaning], ["free", options.free]]) {
  tally.reset();
  for (let t = 1; t <= ticks; t++) {
    // weaning in turns: stretches where the mother holds back, so the pups drift into states of
    // their own making, then stretches where she corrects them from there
    const cycle = options.alone + options.together;
    const alone = phase === "weaning" && cycle > 0 && (t % cycle) < options.alone;
    await tick(brain, creatures, phase, tally, { margin: alone ? 0 : null });
    total += 1;
    if (t % options.block === 0 || t === ticks) {
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`${phase} ${String(t).padStart(6)} (${seconds}s) ${tally.line()}`);
      appendFileSync(join(out, "log.jsonl"), JSON.stringify({ phase, tick: t, total, seconds: +seconds, ...tally.json() }) + "\n");
      tally.reset();
    }
  }
}
const report = (await brain.call({ op: "report" })).report;
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
await brain.call({ op: "streams" });            // the litter's live state ends here; what was learned stays
const saved = await brain.call({ op: "save", path: join(out, "basic.life") });
console.log(`saved ${(saved.bytes / 1e6).toFixed(1)} MB to ${options.out}/basic.life; lessons ${report.lessons_total}, reward updates ${report.updates}, memory writes ${report.memory_writes}`);
brain.close();
