// The mother: a scripted creature that knows the room and shows a young Mochi how a day goes.
// She is disclosed, privileged structure. Her choice becomes a demonstration for the brain
// during the bootstrap and is never consulted by the shipped page. Wherever she can, she
// decides from what Mochi itself can sense (needs, light, what is at its mouth, what is in
// view), so the routine she shows is one a brain with those senses can hold.

import { A } from "./spec.js";
import { BODY, DIRS } from "./world.js";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The move whose direction best matches the way to (x, y).
export function moveToward(m, x, y) {
  const dx = x - m.x, dy = y - m.y;
  let best = 0, bestDot = -Infinity;
  for (let b = 0; b < DIRS.length; b++) {
    const dot = dx * DIRS[b][0] + dy * DIRS[b][1];
    if (dot > bestDot) { bestDot = dot; best = b; }
  }
  return 1 + best;
}

export class Mother {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
    this.ticks = 0;
    this.goal = "rest";
  }
  random() {
    let z = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  go(m, target, stop, arrived) {
    return dist(m, target) > stop ? moveToward(m, target.x, target.y) : arrived;
  }

  act(world) {
    this.ticks += 1;
    const m = world.m, n = m.needs, f = world.furniture;
    const light = world.light(), night = light < 0.3;
    const set = (goal, action) => { this.goal = goal; return action; };
    if (m.held) return set("held", A.rest);

    const inView = item => dist(item, m) <= BODY.view;
    const mouthReach = item => dist(item, m) < BODY.radius + item.r + 6;
    const sources = world.foodSources();
    const nearest = list => list.reduce((best, item) => (!best || dist(item, m) < dist(best, m) ? item : best), null);
    const food = nearest(sources);
    const treat = nearest(sources.filter(s => s.type !== "bowl" && s.taste !== "bitter" && inView(s)));
    const water = f.water.level > 1e-6 ? f.water : null;
    const urgent = n.hunger > 0.95 || n.thirst > 0.95;
    const quiet = (world.sounds.meow || 0) < 0.12;       // its last call has faded: time for another

    // sleep: through the night, and a nap when worn out
    if ((m.asleep || m.pose === "lie") && (night || n.fatigue > 0.12) && !urgent) return set("sleep", A.sleep);
    if ((night || n.fatigue > 0.8) && !urgent) return set("sleep", this.go(m, f.bed, 18, A.sleep));

    // hunger and thirst
    const eating = food && mouthReach(food) && n.hunger > 0.12;
    if (n.hunger > 0.5 || eating) {
      if (food) return set("eat", this.go(m, food, BODY.radius + food.r, A.eat));
      if (n.hunger > 0.6) {                    // an empty bowl: wait at it and ask
        if (dist(m, f.bowl) > 40) return set("beg", moveToward(m, f.bowl.x, f.bowl.y));
        const handSeen = world.hand.present && inView(world.hand);
        return set("beg", handSeen ? A.sit : (quiet ? A.call : A.rest));
      }
    }
    const drinking = water && mouthReach(water) && n.thirst > 0.12;
    if (n.thirst > 0.5 || drinking) {
      if (water) return set("drink", this.go(m, water, BODY.radius + water.r, A.eat));
      if (n.thirst > 0.6) {
        if (dist(m, f.water) > 40) return set("beg", moveToward(m, f.water.x, f.water.y));
        return set("beg", quiet ? A.call : A.rest);
      }
    }

    // a treat in view is worth the walk, hungry or not
    if (treat) return set("treat", this.go(m, treat, BODY.radius + treat.r, A.eat));

    // company
    const hand = world.hand;
    if (hand.present && inView(hand) && n.lonely > 0.35) {
      if (dist(m, hand) > 44) return set("company", moveToward(m, hand.x, hand.y));
      if (m.touch.stroke > 0.3) return set("company", A.rest);
      return set("company", n.lonely > 0.7 ? A.jump : A.paw);
    }

    // play
    const toys = world.toys.filter(toy => inView(toy) && !(toy.inHand && toy.kind !== "wand"));
    const toy = nearest(toys);
    if (n.boredom > 0.5 || (toy && n.boredom > 0.15 && dist(m, toy) < BODY.near)) {
      if (toy) return set("play", dist(m, toy) < BODY.reach - 6 ? A.pounce : moveToward(m, toy.x, toy.y));
      if (dist(m, f.box) > 60) return set("play", moveToward(m, f.box.x, f.box.y));
      return set("play", n.boredom > 0.85 ? A.spin : A.rest);
    }

    // alone for long: call now and then
    if (n.lonely > 0.75 && !(hand.present && inView(hand)) && quiet) return set("call", A.call);

    // otherwise: find the sun and rest
    const sun = world.sun();
    if (sun.on && inView(sun) && !world.onSun(sun)) return set("sun", moveToward(m, sun.x, sun.y));
    return set("rest", A.rest);
  }
}
