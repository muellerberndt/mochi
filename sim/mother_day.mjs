// A day under the mother's control: checks that the room and the routine make sense.
// Usage: node sim/mother_day.mjs [days] [seed]
import { World, TICK_STEPS, TICK } from "../web/js/world.js";
import { Mother } from "../web/js/mother.js";
import { Owner } from "../web/js/owner.js";
import { ACTIONS } from "../web/js/spec.js";
import { sense } from "../web/js/senses.js";

const days = Number(process.argv[2] || 2), seed = Number(process.argv[3] || 1);
const world = new World({ seed, tod: 0.0 });
const mother = new Mother(seed + 100), owner = new Owner(seed + 200);
owner.setup(world);
const ticksPerDay = Math.round(world.daySeconds / TICK);
const actions = new Array(ACTIONS.length).fill(0), goals = {}, events = {};
let reward = 0, active = 0, activeMax = 0, peak = { hunger: 0, thirst: 0, fatigue: 0, boredom: 0, lonely: 0 };
const timeline = [];
for (let tick = 0; tick < days * ticksPerDay; tick++) {
  owner.step(world);
  const observation = sense(world);
  let on = 0;
  for (const v of observation) if (v > 0.05) on += 1;
  active += on; activeMax = Math.max(activeMax, on);
  const action = mother.act(world);
  actions[action] += 1;
  goals[mother.goal] = (goals[mother.goal] || 0) + 1;
  world.setAction(action);
  for (let s = 0; s < TICK_STEPS; s++) world.step();
  reward += world.takeOutcome().reward;
  for (const event of world.events) events[event.type] = (events[event.type] || 0) + 1;
  world.events.length = 0;
  for (const name of Object.keys(peak)) peak[name] = Math.max(peak[name], world.m.needs[name]);
  if (tick % Math.round(ticksPerDay / 24) === 0) timeline.push(`${world.clock()} ${mother.goal}`);
}
const total = days * ticksPerDay;
console.log("ticks", total, "days", days, "mean active inputs", (active / total).toFixed(1), "max", activeMax);
console.log("reward per day", (reward / days).toFixed(2));
console.log("actions", Object.fromEntries(ACTIONS.map((n, i) => [n, +(actions[i] / total).toFixed(3)]).filter(([, v]) => v > 0)));
console.log("goals", Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, +(v / total).toFixed(3)])));
console.log("events", events);
console.log("peak needs", Object.fromEntries(Object.entries(peak).map(([k, v]) => [k, +v.toFixed(2)])));
console.log("day one:", timeline.slice(0, 24).join(" | "));
