// Scenario receipts: what the page promises, tried headless on the same world and brain host.
//
//   teach   say a word, show a move, praise; then ask with the word alone. Counted per lesson:
//           does Mochi answer the word with the move, and does it keep quiet without the word?
//   lemon   offer lemons and cookies in turn: does one bad bite change what it eats?
//   bowl    move the bowl across the room: does it find its meals again?
//
// Usage: node sim/scenarios.mjs --scenario teach --life runs/boot/basic.life [--lessons 8 --seed 1 --out runs/teach.json]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrainProcess, ROOT, args, round } from "./brain_proc.mjs";
import { makeCreature, live } from "./harness.mjs";
import { sense } from "../web/js/senses.js";
import { EMPHASIS } from "../web/js/world.js";
import { A, ACTIONS, HEARING, OFFSETS, SOUNDS, SPEC, WORDS } from "../web/js/spec.js";

const options = args({ scenario: "teach", life: "", lessons: 8, seed: 1, out: "", genes: "", stores: "", contrast: "routine", scold: "no", margin: 2, words: 2, bitter: -1 });
if (options.bitter >= 0) EMPHASIS.bitter = options.bitter;      // how strongly a bad taste is remembered
const brain = new BrainProcess();
const boot = { op: "boot", spec: SPEC, path: join(ROOT, options.life) };
await brain.call(boot);
if (options.stores) await brain.call({ op: "fresh_stores", genes: JSON.parse(options.stores) });   // new empty stores under other store genes
if (options.genes) await brain.call({ op: "genes", genes: JSON.parse(options.genes) });

const creature = makeCreature(options.seed, { owner: false, scatter: false });
const world = creature.world;
world.autoCare = true;
// a calm afternoon: fed, rested, a hand nearby
Object.assign(world.m.needs, { hunger: 0.15, thirst: 0.15, fatigue: 0.15, boredom: 0.2, lonely: 0.15 });
world.tod0 = 0.3; world.m.x = 480; world.m.y = 320;
world.moveHand(560, 300, true);

// The last moment Mochi lived in silence and answered on its own: the other half of a lesson
// about a sound.
// `--contrast routine` keeps only quiet moments Mochi answered with an everyday action, so a
// trick it is offering unprompted is never rehearsed; `any` keeps every quiet moment; `no` none.
let quiet = null, tick = 0, unprompted = 0, quietTicks = 0;
const silent = obs => { for (let cell = 0; cell < HEARING; cell++) if (obs[OFFSETS.hearing + cell] > 0.05) return false; return true; };
async function free(ticks, watch = null, onTrick = null) {
  let first = -1;
  for (let i = 0; i < ticks; i++) {
    tick += 1;
    sense(world, creature.observation);
    const wake = creature.arousal.update(creature.outcome, world.novelty(), world.m.needs);
    const obs = round(creature.observation);
    const answer = await brain.call({ op: "tick", obs: [obs], reward: [creature.outcome.reward],
      salience: [Math.abs(creature.outcome.reward) + creature.outcome.emphasis], aroused: wake });
    const action = answer.refused ? A.rest : answer.action[0];
    if (!answer.refused && silent(obs)) {
      quietTicks += 1;
      if (action >= A.sit) { unprompted += 1; if (onTrick) onTrick(action); }
      if (options.contrast === "any" || answer.own[0] < A.sit) quiet = { obs: [obs], action: [answer.own[0]], at: tick };
    }
    if (watch && first < 0 && watch(action)) first = action;
    live(creature, action);
  }
  return first;
}
async function shown(action, ticks) {
  for (let i = 0; i < ticks; i++) {
    tick += 1;
    sense(world, creature.observation);
    const obs = round(creature.observation);
    const message = { op: "tick", obs: [obs], reward: [creature.outcome.reward],
      salience: [Math.abs(creature.outcome.reward) + creature.outcome.emphasis], guide: [action], margin: options.margin };
    if (options.contrast !== "no" && quiet && tick - quiet.at < 80 && !silent(obs)) message.contrast = { obs: quiet.obs, action: quiet.action };
    await brain.call(message);
    live(creature, action);
  }
}
function heard(word) {
  sense(world, creature.observation);
  const obs = Float32Array.from(creature.observation);
  for (let cell = 0; cell < HEARING; cell++) obs[OFFSETS.hearing + cell] = 0;
  if (word) for (const cell of SOUNDS[word]) obs[OFFSETS.hearing + cell] = 1;
  return round(obs);
}
async function would(word, action) {
  const answer = (await brain.call({ op: "probe", obs: [heard(word)] })).answers[0];
  return answer.qualified ? +answer.policy[action].toFixed(3) : null;
}
const calm = () => { Object.assign(world.m.needs, { hunger: 0.15, thirst: 0.15, fatigue: 0.15, boredom: 0.2, lonely: 0.15 }); };
const isTrick = action => action >= A.sit;

let result;
if (options.scenario === "teach") {
  // two words, two moves, taught in turn; each asked alone after every lesson
  const pairs = [[WORDS[0], A.sit], [WORDS[1], A.spin], [WORDS[2], A.jump], [WORDS[3], A.paw]].slice(0, options.words);
  const scold = options.scold === "yes" ? () => world.scold() : null;
  const rows = [];
  const before = [];
  for (const [word, move] of pairs) before.push({ word, move: ACTIONS[move], with_word: await would(word, move), in_silence: await would(null, move) });
  for (let lesson = 1; lesson <= options.lessons; lesson++) {
    const row = { lesson };
    unprompted = 0; quietTicks = 0;
    for (const [word, move] of pairs) {
      calm();
      world.say(word);
      await shown(move, 6);
      world.praise();
      await free(14, null, scold);
    }
    for (const [word, move] of pairs) {
      calm();
      world.say(word);
      const answer = await free(10, isTrick);
      row[word] = { answered: answer < 0 ? "nothing" : ACTIONS[answer], right: answer === move,
        would_with_word: await would(word, move), would_in_silence: await would(null, move) };
      if (answer === move) world.praise();
      await free(12, null, scold);
    }
    row.unprompted = +(unprompted / Math.max(1, quietTicks)).toFixed(3);
    rows.push(row);
    console.log(`lesson ${lesson}: ` + pairs.map(([word, move]) => `${word}->${row[word].answered}${row[word].right ? " ✓" : ""} (${row[word].would_with_word}/${row[word].would_in_silence})`).join("  ") + `  unprompted ${row.unprompted}`);
  }
  const tail = rows.slice(-4);
  const right = tail.reduce((sum, row) => sum + pairs.filter(([word]) => row[word].right).length, 0);
  const first = rows.findIndex(row => pairs.every(([word]) => row[word].right)) + 1;
  result = { scenario: "teach", options, before, rows, right_in_last_4_lessons: right, asked_in_last_4_lessons: 4 * pairs.length,
    first_lesson_all_right: first || null, unprompted_last_4: +(tail.reduce((sum, row) => sum + row.unprompted, 0) / tail.length).toFixed(3) };
  console.log(`right in the last four lessons: ${right} of ${4 * pairs.length}; first lesson with every word right: ${first || "none"}; unprompted tricks per quiet tick, last four: ${result.unprompted_last_4}`);
} else if (options.scenario === "lemon") {
  // hold out a treat until it is eaten or 8 s pass; alternate lemon and cookie
  const offers = [];
  for (let k = 0; k < options.lessons * 2; k++) {
    const flavor = k % 2 === 0 ? "lemon" : "cookie";
    calm(); world.m.needs.hunger = 0.4;
    world.moveHand(world.m.x + 90, world.m.y + 10, true);
    world.holdTreat(flavor);
    let eaten = false;
    for (let t = 0; t < 54 && !eaten; t++) { await free(1); eaten = world.hand.holding === null; }
    world.holdNothing();
    offers.push({ offer: k + 1, flavor, eaten });
    await free(30);
  }
  const share = (flavor, list) => { const rows = list.filter(o => o.flavor === flavor); return rows.length ? +(rows.filter(o => o.eaten).length / rows.length).toFixed(2) : null; };
  const half = offers.length / 2;
  result = { scenario: "lemon", offers, first_half: { lemon: share("lemon", offers.slice(0, half)), cookie: share("cookie", offers.slice(0, half)) },
    second_half: { lemon: share("lemon", offers.slice(half)), cookie: share("cookie", offers.slice(half)) } };
  console.log(JSON.stringify({ first_half: result.first_half, second_half: result.second_half }));
} else if (options.scenario === "bowl") {
  // meals per half day before and after the bowl moves to the far wall
  const meals = async ticks => { const start = creature.events.eat || 0; await free(ticks); return (creature.events.eat || 0) - start; };
  world.autoCare = true;
  const before = await meals(1200);
  world.moveFurniture("bowl", 200, 330);
  world.fillBowl();
  const after = [];
  for (let k = 0; k < 4; k++) { world.fillBowl(); after.push(await meals(600)); }
  result = { scenario: "bowl", meals_before_per_1200_ticks: before, meals_after_per_600_ticks: after, hunger_at_end: +world.m.needs.hunger.toFixed(2) };
  console.log(JSON.stringify(result));
} else throw new Error(`unknown scenario ${options.scenario}`);

if (options.out) writeFileSync(join(ROOT, options.out), JSON.stringify(result, null, 1));
brain.close();
