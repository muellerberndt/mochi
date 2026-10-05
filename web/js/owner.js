// A stand-in owner for headless life: it visits, pets, feeds, throws the ball, waves the
// feather, forgets the bowl now and then, and sometimes makes a noise. The bootstrap uses it so
// a young Mochi meets the situations a player will create. Called once per decision tick.

import { ROOM } from "./world.js";
import { WORDS } from "./spec.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Owner {
  constructor(seed = 1, { rate = 1 / 240 } = {}) {
    this.state = (seed >>> 0) || 1;
    this.rate = rate;                         // sessions per tick while Mochi is awake
    this.session = null;
    this.day = -1;
    this.refillAt = null;
    this.emptyTicks = 0;
    this.ticks = 0;
  }
  random() {
    let z = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  uniform(lo, hi) { return lo + (hi - lo) * this.random(); }
  integer(lo, hi) { return Math.floor(this.uniform(lo, hi + 1)); }
  near(world, lo, hi) {
    const angle = this.uniform(0, 2 * Math.PI), d = this.uniform(lo, hi), edge = ROOM.wall + 20;
    return {
      x: clamp(world.m.x + Math.cos(angle) * d, edge, ROOM.w - edge),
      y: clamp(world.m.y + Math.sin(angle) * d, edge, ROOM.h - edge),
    };
  }

  setup(world) {
    world.autoCare = false;
    const box = world.furniture.box;
    world.spawnToy("ball", box.x + this.uniform(40, 160), box.y - this.uniform(20, 120));
    if (this.random() < 0.5) world.spawnToy("mouse", box.x + this.uniform(30, 120), box.y - this.uniform(0, 80));
    world.events.length = 0;
  }

  step(world) {
    this.ticks += 1;
    // the feeder's duties: usually at dawn, sometimes late, so begging gets practised and answered
    if (world.day !== this.day) {
      this.day = world.day;
      this.refillAt = this.ticks + (this.random() < 0.85 ? 0 : this.integer(200, 600));
    }
    const bowl = world.furniture.bowl, water = world.furniture.water;
    this.emptyTicks = bowl.food < 0.05 || water.level < 0.05 ? this.emptyTicks + 1 : 0;
    if (this.refillAt === null && this.emptyTicks === 1) this.refillAt = this.ticks + this.integer(120, 420);
    if (this.refillAt !== null && this.ticks >= this.refillAt) {
      world.fillBowl(); world.fillWater();
      this.refillAt = null;
    }

    if (this.session) {
      this.session.left -= 1;
      const done = this.session.update(world) === false || this.session.left <= 0;
      if (done) {
        if (this.session.end) this.session.end(world);
        world.setPetting(false);
        world.holdNothing();
        world.moveHand(world.hand.x, world.hand.y, false);
        this.session = null;
      }
      return;
    }
    if (world.m.asleep ? this.random() > this.rate * 0.05 : this.random() > this.rate) return;
    this.session = this.begin(world);
  }

  begin(world) {
    const roll = this.random();
    if (roll < 0.30) {                         // a visit, usually with strokes
      const spot = this.near(world, 120, 380), pets = this.random() < 0.8;
      world.moveHand(spot.x, spot.y, true);
      return {
        left: this.integer(40, 100),
        update: w => { w.setPetting(pets && w.handOver()); },
      };
    }
    if (roll < 0.45) {                         // a treat held out
      const spot = this.near(world, 150, 350);
      world.moveHand(spot.x, spot.y, true);
      world.holdTreat(this.flavor());
      let after = 12;
      return {
        left: this.integer(40, 70),
        update: w => (w.hand.holding ? true : (after -= 1) > 0),
      };
    }
    if (roll < 0.60) {                         // a treat dropped somewhere
      const edge = ROOM.wall + 30;
      const spot = { x: this.uniform(edge, ROOM.w - edge), y: this.uniform(edge, ROOM.h - edge) };
      world.moveHand(spot.x, spot.y, true);
      world.dropTreat(spot.x, spot.y, this.flavor());
      return { left: 8, update: () => true };
    }
    if (roll < 0.80) {                         // the ball is thrown
      const ball = world.toys.find(toy => toy.kind === "ball");
      if (!ball) return null;
      world.moveHand(ball.x, ball.y, true);
      const angle = this.uniform(0, 2 * Math.PI), speed = this.uniform(300, 650);
      ball.vx = Math.cos(angle) * speed; ball.vy = Math.sin(angle) * speed;
      return { left: 6, update: () => true };
    }
    if (roll < 0.90) {                         // the feather
      const spot = this.near(world, 80, 200);
      world.moveHand(spot.x, spot.y, true);
      const wand = world.spawnToy("wand", spot.x, spot.y + 26);
      const fx = this.uniform(0.05, 0.12), fy = this.uniform(0.05, 0.12), phase = this.uniform(0, 6.28);
      let k = 0;
      return {
        left: this.integer(50, 90),
        update: w => {
          k += 1;
          const edge = ROOM.wall + 20;
          w.moveHand(
            clamp(w.m.x + Math.cos(k * fx + phase) * 150, edge, ROOM.w - edge),
            clamp(w.m.y + Math.sin(k * fy) * 110, edge, ROOM.h - edge), true);
        },
        end: w => w.removeToy(wand.id),
      };
    }
    if (roll < 0.95) {                         // the wind-up mouse
      let mouse = world.toys.find(toy => toy.kind === "mouse");
      if (!mouse) mouse = world.spawnToy("mouse", world.furniture.box.x + 60, world.furniture.box.y - 40);
      world.moveHand(mouse.x, mouse.y, true);
      world.windMouse(mouse.id);
      return { left: 5, update: () => true };
    }
    if (roll < 0.975) {                        // picked up and set down elsewhere
      const spot = this.near(world, 120, 300);
      world.moveHand(world.m.x, world.m.y, true);
      if (!world.pickUp()) return null;
      let k = 0;
      const fromX = world.m.x, fromY = world.m.y;
      return {
        left: 12,
        update: w => {
          k += 1;
          const u = Math.min(1, k / 9);
          w.moveHand(fromX + (spot.x - fromX) * u, fromY + (spot.y - fromY) * u, true);
          if (k === 10) w.putDown();
        },
        end: w => w.putDown(),
      };
    }
    const noise = this.random();               // a noise that means nothing yet
    if (noise < 0.6) world.say(WORDS[this.integer(0, WORDS.length - 1)]);
    else if (noise < 0.85) world.whistle();
    else world.clap();
    return null;
  }

  flavor() {
    const roll = this.random();
    return roll < 0.6 ? "cookie" : roll < 0.94 ? "fish" : "lemon";
  }
}

