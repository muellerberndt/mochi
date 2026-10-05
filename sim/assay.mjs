// Behaviour of one creature over whole days, counted against the declared baselines.
//
//   brain    a raised brain lives on its own: the body's arousal decides when it learns
//   frozen   the same brain answering greedily, never learning (a control for live learning)
//   mother   the scripted mother moves the body (the teacher, an upper reference)
//   random   every action drawn uniformly from the seventeen (the baseline for every claim)
//
// Counts are things a creature cannot fake: portions eaten, drinks taken, the share of the
// night spent asleep in bed, pounces that hit, how high each need climbed, reward per day.
// Usage: node sim/assay.mjs --policy brain --life runs/boot/basic.life --days 3 --seeds 3 --out runs/assay-brain.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrainProcess, ROOT, args, round } from "./brain_proc.mjs";
import { makeCreature, live } from "./harness.mjs";
import { TICK } from "../web/js/world.js";
import { sense } from "../web/js/senses.js";
import { A, ACTIONS, SPEC } from "../web/js/spec.js";

const options = args({ policy: "brain", life: "", days: 3, seeds: 3, seed: 100, out: "", owner: "yes", genes: "" });

async function life(seed) {
  const creature = makeCreature(seed, { owner: options.owner === "yes", scatter: false });
  const world = creature.world;
  const ticks = Math.round(options.days * world.daySeconds / TICK);
  let brain = null;
  if (options.policy === "brain" || options.policy === "frozen") {
    brain = new BrainProcess();
    await brain.call({ op: "boot", spec: SPEC, path: join(ROOT, options.life) });
    if (options.genes) await brain.call({ op: "genes", genes: JSON.parse(options.genes) });
  }
  let state = seed * 2654435761 >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const count = { ticks, eaten: 0, drunk: 0, pounces: 0, hits: 0, calls: 0, bumps: 0, night: 0, nightAsleepInBed: 0, nightAsleep: 0,
    routine: 0, aroused: 0, refused: 0, sweepsRoutine: 0, sweepsAroused: 0, reward: 0, agree: 0, moves: 0, begged: 0 };
  const need = { hunger: 0, thirst: 0, fatigue: 0, boredom: 0, lonely: 0 }, peak = { ...need };
  const used = new Array(ACTIONS.length).fill(0);
  let food = world.furniture.bowl.food, water = world.furniture.water.level;
  for (let t = 0; t < ticks; t++) {
    if (creature.owner) creature.owner.step(world);
    const label = creature.mother.act(world);
    let action = label;
    if (options.policy === "random") action = Math.floor(random() * ACTIONS.length);
    else if (brain) {
      sense(world, creature.observation);
      const wake = options.policy === "brain" && creature.arousal.update(creature.outcome, world.novelty(), world.m.needs);
      const answer = await brain.call({ op: "tick", obs: [round(creature.observation)], reward: [creature.outcome.reward],
        salience: [Math.abs(creature.outcome.reward) + creature.outcome.emphasis], aroused: wake });
      if (answer.refused) { count.refused += 1; action = A.rest; }
      else {
        action = answer.action[0];
        if (answer.mode === "routine") { count.routine += 1; count.sweepsRoutine += answer.sweeps; }
        else { count.aroused += 1; count.sweepsAroused += answer.sweeps; }
      }
    }
    if (action === label) count.agree += 1;
    used[action] += 1;
    const before = { food: world.furniture.bowl.food, water: world.furniture.water.level, treats: world.foods.length };
    live(creature, action);
    count.reward += creature.outcome.reward;
    count.eaten += Math.max(0, before.food - world.furniture.bowl.food) + 0;
    count.drunk += Math.max(0, before.water - world.furniture.water.level);
    const m = world.m;
    if (world.light() < 0.3) { count.night += 1; if (m.asleep) { count.nightAsleep += 1; if (world.onBed()) count.nightAsleepInBed += 1; } }
    for (const name of Object.keys(need)) { need[name] += m.needs[name]; peak[name] = Math.max(peak[name], m.needs[name]); }
  }
  const events = creature.events;
  if (brain) brain.close();
  const perDay = value => +(value / options.days).toFixed(2);
  return {
    seed, policy: options.policy,
    portions_per_day: perDay(count.eaten), treats_eaten_per_day: perDay((events.eat || 0)), drinks_per_day: perDay(count.drunk),
    night_asleep_in_bed: +(count.nightAsleepInBed / Math.max(1, count.night)).toFixed(3),
    night_asleep: +(count.nightAsleep / Math.max(1, count.night)).toFixed(3),
    pounce_hits_per_day: perDay((events.kick || 0) + (events.caught || 0)), calls_per_day: perDay(events.call || 0), bumps_per_day: perDay(events.bump || 0),
    reward_per_day: perDay(count.reward),
    mean_need: Object.fromEntries(Object.entries(need).map(([k, v]) => [k, +(v / ticks).toFixed(3)])),
    peak_need: Object.fromEntries(Object.entries(peak).map(([k, v]) => [k, +v.toFixed(2)])),
    agreement_with_mother: +(count.agree / ticks).toFixed(3),
    routine_share: +(count.routine / Math.max(1, count.routine + count.aroused)).toFixed(3),
    sweeps: { routine: +(count.sweepsRoutine / Math.max(1, count.routine)).toFixed(1), aroused: +(count.sweepsAroused / Math.max(1, count.aroused)).toFixed(1) },
    refused: count.refused,
    actions: Object.fromEntries(ACTIONS.map((name, i) => [name, +(used[i] / ticks).toFixed(3)]).filter(([, v]) => v > 0.004)),
  };
}

const results = [];
for (let i = 0; i < options.seeds; i++) {
  const row = await life(options.seed + i);
  results.push(row);
  console.log(`${options.policy} seed ${row.seed}: portions/day ${row.portions_per_day} drinks/day ${row.drinks_per_day} bed-nights ${row.night_asleep_in_bed} ` +
    `play/day ${row.pounce_hits_per_day} reward/day ${row.reward_per_day} mean hunger ${row.mean_need.hunger} thirst ${row.mean_need.thirst} agree ${row.agreement_with_mother} routine ${row.routine_share} refused ${row.refused}`);
}
const mean = key => +(results.reduce((sum, row) => sum + row[key], 0) / results.length).toFixed(3);
const summary = { policy: options.policy, life: options.life, days: options.days, seeds: options.seeds,
  portions_per_day: mean("portions_per_day"), drinks_per_day: mean("drinks_per_day"), night_asleep_in_bed: mean("night_asleep_in_bed"),
  night_asleep: mean("night_asleep"), refused: mean("refused"),
  pounce_hits_per_day: mean("pounce_hits_per_day"), reward_per_day: mean("reward_per_day"), agreement_with_mother: mean("agreement_with_mother"),
  routine_share: mean("routine_share"),
  mean_hunger: +(results.reduce((s, r) => s + r.mean_need.hunger, 0) / results.length).toFixed(3),
  mean_thirst: +(results.reduce((s, r) => s + r.mean_need.thirst, 0) / results.length).toFixed(3) };
console.log(JSON.stringify(summary));
if (options.out) writeFileSync(join(ROOT, options.out), JSON.stringify({ summary, results }, null, 1));
