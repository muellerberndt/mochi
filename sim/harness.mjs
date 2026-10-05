// Headless lives: creatures in their rooms, one brain process, the three kinds of tick.
import { World, TICK_STEPS } from "../web/js/world.js";
import { Mother } from "../web/js/mother.js";
import { Owner } from "../web/js/owner.js";
import { Arousal } from "../web/js/arousal.js";
import { sense } from "../web/js/senses.js";
import { A, ACTIONS, INPUTS } from "../web/js/spec.js";
import { round } from "./brain_proc.mjs";

export const GROUPS = {
  rest: [A.rest], move: [1, 2, 3, 4, 5, 6, 7, 8], eat: [A.eat], sleep: [A.sleep],
  pounce: [A.pounce], call: [A.call], trick: [A.sit, A.spin, A.jump, A.paw],
};
const groupOf = (() => {
  const out = new Array(ACTIONS.length).fill("rest");
  for (const [name, members] of Object.entries(GROUPS)) for (const a of members) out[a] = name;
  return out;
})();

function mulberry(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    let z = (state = (state + 0x6D2B79F5) >>> 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// A creature somewhere in its day: random hour, needs and place, its own mother and owner.
export function makeCreature(seed, { owner = true, scatter = true } = {}) {
  const random = mulberry(seed * 7919 + 13);
  const world = new World({ seed, tod: scatter ? random() : 0.02 });
  if (scatter) {
    const m = world.m;
    m.x = 80 + random() * 800; m.y = 80 + random() * 440;
    for (const name of Object.keys(m.needs)) m.needs[name] = 0.05 + random() * 0.7;
  }
  const creature = {
    seed, world, mother: new Mother(seed + 1000), owner: owner ? new Owner(seed + 2000) : null,
    arousal: new Arousal(), observation: new Float32Array(INPUTS), outcome: { reward: 0, pain: 0, social: 0 },
    events: {}, ticks: 0,
  };
  if (creature.owner) creature.owner.setup(world);
  return creature;
}

// Advance one creature's body by one decision tick under `action` and collect its outcome.
export function live(creature, action) {
  const world = creature.world;
  world.setAction(action < 0 ? A.rest : action);
  for (let s = 0; s < TICK_STEPS; s++) world.step();
  creature.outcome = world.takeOutcome();
  for (const event of world.events) creature.events[event.type] = (creature.events[event.type] || 0) + 1;
  world.events.length = 0;
  creature.ticks += 1;
}

export class Tally {
  constructor() { this.reset(); }
  reset() {
    this.n = 0; this.agree = 0; this.greedy = 0; this.reward = 0; this.refused = 0; this.routine = 0;
    this.sweeps = 0; this.by = {}; this.confusion = {};
  }
  add(label, own, greedy, reward) {
    this.n += 1; this.reward += reward;
    if (own === label) this.agree += 1;
    if (greedy === label) this.greedy += 1;
    const group = groupOf[label];
    const row = (this.by[group] ||= { n: 0, agree: 0 });
    row.n += 1;
    if ((greedy ?? own) === label) row.agree += 1;
  }
  line() {
    const share = (a, b) => (b ? (a / b).toFixed(3) : "  -  ");
    const groups = Object.keys(GROUPS).map(g => `${g} ${share(this.by[g]?.agree || 0, this.by[g]?.n || 0)}`).join("  ");
    return `agree ${share(this.agree, this.n)} greedy ${share(this.greedy, this.n)} reward/tick ${(this.reward / Math.max(1, this.n)).toFixed(4)} ` +
      `refused ${this.refused} routine ${share(this.routine, this.n)} sweeps ${(this.sweeps / Math.max(1, this.n)).toFixed(0)} | ${groups}`;
  }
  json() {
    const by = Object.fromEntries(Object.entries(this.by).map(([g, row]) => [g, +(row.agree / row.n).toFixed(4)]));
    return {
      n: this.n, agree: +(this.agree / Math.max(1, this.n)).toFixed(4), greedy: +(this.greedy / Math.max(1, this.n)).toFixed(4),
      reward: +(this.reward / Math.max(1, this.n)).toFixed(5), refused: this.refused, routine: +(this.routine / Math.max(1, this.n)).toFixed(4),
      sweeps: +(this.sweeps / Math.max(1, this.n)).toFixed(1), by,
    };
  }
}

const argmax = row => row.reduce((best, value, index) => (value > row[best] ? index : best), 0);

// One tick for every creature in one brain call. `mode`: "guided" (the mother moves the body
// and corrects where the brain's own answer disagrees), "weaning" (the same corrections while
// the brain moves its own body) or "free" (no mother; with one creature the body's arousal
// gates learning, with several every tick is aroused).
export async function tick(brain, creatures, mode, tally, { aroused = null, margin = null } = {}) {
  const labels = [], obs = [], rewards = [], salience = [];
  for (const creature of creatures) {
    if (creature.owner) creature.owner.step(creature.world);
    sense(creature.world, creature.observation);
    obs.push(round(creature.observation));
    labels.push(creature.mother.act(creature.world));
    rewards.push(creature.outcome.reward);
    salience.push(Math.abs(creature.outcome.reward) + (creature.outcome.emphasis || 0));
  }
  const message = { op: "tick", obs, reward: rewards, salience, want: { policy: mode === "free" } };
  if (margin !== null) message.margin = margin;
  if (mode === "guided") { message.guide = labels; message.record = false; }
  else if (mode === "weaning") { message.guide = labels; message.independence = 1; message.record = false; }
  else {
    let wake = aroused;
    if (wake === null) {
      wake = creatures.length > 1;
      if (creatures.length === 1) {
        const c = creatures[0];
        wake = c.arousal.update(c.outcome, c.world.novelty(), c.world.m.needs);
      }
    }
    message.aroused = wake;
  }
  const answer = await brain.call(message);
  creatures.forEach((creature, i) => {
    const executed = answer.refused ? -1 : answer.action[i];
    if (tally) {
      if (answer.refused) tally.refused += 1;
      else {
        const greedy = answer.policy ? argmax(answer.policy[i]) : answer.own[i];
        tally.add(labels[i], answer.own[i], greedy, creature.outcome.reward);
        tally.sweeps += answer.sweeps;
        if (answer.mode === "routine") tally.routine += 1;
      }
    }
    live(creature, executed);
  });
  return answer;
}
