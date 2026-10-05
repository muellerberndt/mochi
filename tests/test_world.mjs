// The room, the senses and the mother: run with `node --test tests/`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { World, TICK_STEPS, TICK, BODY } from "../web/js/world.js";
import { sense } from "../web/js/senses.js";
import { Mother } from "../web/js/mother.js";
import { Owner } from "../web/js/owner.js";
import { Arousal } from "../web/js/arousal.js";
import { A, ACTIONS, INPUTS, OFFSETS, SOUNDS, SPEC } from "../web/js/spec.js";

const live = (world, action, ticks = 1) => { for (let t = 0; t < ticks; t++) { world.setAction(action); for (let s = 0; s < TICK_STEPS; s++) world.step(); } };

test("the Python side reads the same senses and actions", () => {
  const exported = JSON.parse(readFileSync(new URL("../mochi/spec.json", import.meta.url), "utf8"));
  assert.deepEqual(exported, JSON.parse(JSON.stringify(SPEC)));
  assert.equal(SPEC.senses.reduce((sum, sense) => sum + sense.size, 0), INPUTS);
});

test("the same seed and the same actions give the same life", () => {
  const run = () => {
    const world = new World({ seed: 7, tod: 0.2 });
    const mother = new Mother(3), owner = new Owner(4);
    owner.setup(world);
    for (let t = 0; t < 400; t++) { owner.step(world); live(world, mother.act(world)); }
    return JSON.stringify(world.snapshot());
  };
  assert.equal(run(), run());
});

test("a saved room continues exactly", () => {
  const world = new World({ seed: 9, tod: 0.3 });
  world.spawnToy("ball", 300, 300);
  live(world, A.east, 20);
  const copy = World.restore(world.snapshot());
  live(world, A.south, 30); live(copy, A.south, 30);
  assert.equal(JSON.stringify(copy.snapshot()), JSON.stringify(world.snapshot()));
});

test("eating at the bowl relieves hunger and pays; eating elsewhere does nothing", () => {
  const world = new World({ seed: 1, tod: 0.3 });
  const m = world.m;
  m.needs.hunger = 0.7;
  live(world, A.eat, 8);
  assert.ok(m.needs.hunger > 0.7, "no food at the bed");
  assert.ok(world.takeOutcome().reward <= 0);
  m.x = world.furniture.bowl.x - 30; m.y = world.furniture.bowl.y;
  live(world, A.eat, 8);
  assert.ok(m.needs.hunger < 0.5, `hunger fell to ${m.needs.hunger}`);
  assert.ok(world.takeOutcome().reward > 0.3);
  assert.ok(world.furniture.bowl.food < 3);
});

test("sleep comes in bed and rests; a clap wakes", () => {
  const world = new World({ seed: 2, tod: 0.8 });
  world.m.needs.fatigue = 0.8;
  live(world, A.sleep, 30);
  assert.ok(world.m.asleep);
  assert.ok(world.m.needs.fatigue < 0.8);
  world.clap();
  assert.ok(!world.m.asleep);
});

test("senses stay in range, point at food, close with the eyes and hear a word", () => {
  const world = new World({ seed: 3, tod: 0.3 });
  const m = world.m;
  m.x = 400; m.y = 300;
  world.dropTreat(600, 300, "cookie");
  let x = sense(world);
  assert.equal(x.length, INPUTS);
  for (const value of x) assert.ok(value >= 0 && value <= 1);
  const smell = Array.from(x.subarray(OFFSETS.smell, OFFSETS.smell + 8));
  assert.equal(smell.indexOf(Math.max(...smell)), 2, "the cookie lies east");
  world.say("word2");
  x = sense(world);
  for (const cell of SOUNDS.word2) assert.ok(x[OFFSETS.hearing + cell] > 0.9);
  m.asleep = true;
  x = sense(world);
  const sight = x.subarray(OFFSETS["vision.hue"], OFFSETS["vision.hue"] + 96);
  assert.equal(Math.max(...sight), 0);
});

test("sight ends at its range: a bowl across the room is not seen", () => {
  const world = new World({ seed: 4, tod: 0.85 });     // night: no sun patch shares the bowl's hue
  world.m.x = 120; world.m.y = 480;
  world.furniture.bowl.food = 0;
  const x = sense(world);
  const orange = x.subarray(OFFSETS["vision.hue"] + 16, OFFSETS["vision.hue"] + 32);   // hue 1
  assert.ok(Math.hypot(world.furniture.bowl.x - 120, world.furniture.bowl.y - 480) > BODY.view);
  assert.equal(Math.max(...orange), 0);
});

test("the mother's day: meals, water, play and a night in bed", () => {
  const world = new World({ seed: 11, tod: 0.0 });
  const mother = new Mother(12), owner = new Owner(13);
  owner.setup(world);
  const ticks = Math.round(2 * world.daySeconds / TICK);
  let eaten = 0, night = 0, inBed = 0, reward = 0;
  const events = {};
  for (let t = 0; t < ticks; t++) {
    owner.step(world);
    const before = world.furniture.bowl.food;
    live(world, mother.act(world));
    eaten += Math.max(0, before - world.furniture.bowl.food);
    reward += world.takeOutcome().reward;
    for (const event of world.events) events[event.type] = (events[event.type] || 0) + 1;
    world.events.length = 0;
    if (world.light() < 0.3) { night += 1; if (world.m.asleep && world.onBed()) inBed += 1; }
  }
  assert.ok(eaten >= 4, `ate ${eaten} portions in two days`);
  assert.ok((events.drink || 0) >= 3);
  assert.ok((events.pounce || 0) >= 5);
  assert.ok(inBed / night > 0.8, `in bed ${(inBed / night).toFixed(2)} of the night`);
  assert.ok(reward > 15);
});

test("arousal: a meal leaves it calm", () => {
  const quiet = { hunger: 0.4, thirst: 0.2, fatigue: 0.2, boredom: 0.2, lonely: 0.2 };
  const arousal = new Arousal();
  let aroused = true;
  for (let t = 0; t < 30; t++) aroused = arousal.update({ reward: 0.086, pain: 0, social: 0 }, 0, quiet);
  assert.equal(aroused, false);
});

test("arousal: calm in an eventless moment, awake after praise, a bad taste or an unmet need", () => {
  const quiet = { hunger: 0.2, thirst: 0.2, fatigue: 0.2, boredom: 0.2, lonely: 0.2 };
  const calm = new Arousal();
  let aroused = true;
  for (let t = 0; t < 60; t++) aroused = calm.update({ reward: 0, pain: 0, social: 0 }, 0, quiet);
  assert.equal(aroused, false);
  assert.equal(calm.update({ reward: 0.8, pain: 0, social: 1 }, 0, quiet), true);
  const hurt = new Arousal();
  for (let t = 0; t < 60; t++) hurt.update({ reward: 0, pain: 0, social: 0 }, 0, quiet);
  assert.equal(hurt.update({ reward: -0.6, pain: 0.4, social: 0 }, 0, quiet), true);
  const hungry = new Arousal();                              // going to the bowl is routine
  assert.equal(hungry.update({ reward: 0, pain: 0, social: 0 }, 0, { ...quiet, hunger: 0.9 }), false);
  const forced = new Arousal({ need: 0.85 });                // the gene that forces arousal on an unmet need
  assert.equal(forced.update({ reward: 0, pain: 0, social: 0 }, 0, { ...quiet, hunger: 0.9 }), true);
  const curious = new Arousal();                             // something new in view, then familiar
  assert.equal(curious.update({ reward: 0, pain: 0, social: 0 }, 1, quiet), false);
  let level = false;
  for (let t = 0; t < 3; t++) level = curious.update({ reward: 0, pain: 0, social: 0 }, 1, quiet);
  assert.equal(level, true);
  for (let t = 0; t < 40; t++) level = curious.update({ reward: 0, pain: 0, social: 0 }, 0.02, quiet);
  assert.equal(level, false);
});

test("every action has a name and the tricks close the list", () => {
  assert.equal(ACTIONS.length, 17);
  assert.deepEqual(ACTIONS.slice(A.sit), ["sit", "spin", "jump", "paw"]);
});
