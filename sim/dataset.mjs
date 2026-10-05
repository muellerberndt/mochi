// Record the mother's days as (observation, action) streams: the lessons a guided bootstrap
// would see, without any brain. Used by tools/sweep.py to compare brain settings quickly.
// Usage: node sim/dataset.mjs --out runs/dataset --streams 16 --ticks 3000 --seed 1
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, args } from "./brain_proc.mjs";
import { makeCreature, live } from "./harness.mjs";
import { sense } from "../web/js/senses.js";
import { INPUTS, SPEC } from "../web/js/spec.js";

const options = args({ out: "runs/dataset", streams: 16, ticks: 3000, seed: 1 });
const out = join(ROOT, options.out);
mkdirSync(out, { recursive: true });
const creatures = Array.from({ length: options.streams }, (_, i) => makeCreature(options.seed * 1000 + i));
const observations = new Float32Array(options.ticks * options.streams * INPUTS);
const labels = new Uint8Array(options.ticks * options.streams);
const rewards = new Float32Array(options.ticks * options.streams);
const goals = new Uint8Array(options.ticks * options.streams);
const GOALS = ["rest", "held", "sleep", "eat", "beg", "drink", "treat", "company", "play", "call", "sun"];
for (let t = 0; t < options.ticks; t++) {
  creatures.forEach((creature, i) => {
    if (creature.owner) creature.owner.step(creature.world);
    const at = t * options.streams + i;
    sense(creature.world, creature.observation);
    observations.set(creature.observation, at * INPUTS);
    rewards[at] = creature.outcome.reward;         // the outcome of the preceding action
    const action = creature.mother.act(creature.world);
    labels[at] = action;
    goals[at] = GOALS.indexOf(creature.mother.goal);
    live(creature, action);
  });
}
writeFileSync(join(out, "observations.f32"), Buffer.from(observations.buffer));
writeFileSync(join(out, "labels.u8"), Buffer.from(labels.buffer));
writeFileSync(join(out, "rewards.f32"), Buffer.from(rewards.buffer));
writeFileSync(join(out, "goals.u8"), Buffer.from(goals.buffer));
writeFileSync(join(out, "meta.json"), JSON.stringify({ ...options, inputs: INPUTS, goals: GOALS, spec: SPEC }, null, 1));
const counts = new Array(SPEC.actions.length).fill(0);
for (const label of labels) counts[label] += 1;
console.log(`${options.ticks} ticks x ${options.streams} streams ->`, options.out);
console.log(Object.fromEntries(SPEC.actions.map((name, i) => [name, +(counts[i] / labels.length).toFixed(4)])));
