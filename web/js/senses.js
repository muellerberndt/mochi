// What reaches Mochi's brain: population codes in [0, 1], egocentric and local. Sight ends at
// BODY.view, so a bowl across the room is known only from memory. No object identity, target,
// teacher goal or lesson answer is a sense: sight carries hue, bearing and range; smell carries
// odour bearing and quality; hearing carries a cochlear pattern.

import { BODY, DIRS, ROOM, FLAVORS } from "./world.js";
import {
  BEARINGS, HUES, HUE_WIDTH, INPUTS, NEEDS, NEED_LEVELS, OFFSETS, PLACE_GRID, SOUNDS,
} from "./spec.js";

const smooth = (lo, hi, v) => {
  const u = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return u * u * (3 - 2 * u);
};

// Response of each bearing cell to something at offset (dx, dy); a thing underfoot has no bearing.
function bearings(dx, dy, out) {
  const d = Math.hypot(dx, dy);
  if (d < 12) { out.fill(0.4); return d; }
  const ux = dx / d, uy = dy / d;
  for (let b = 0; b < BEARINGS; b++) {
    const c = ux * DIRS[b][0] + uy * DIRS[b][1];
    out[b] = c > 0 ? c * c * c * c : 0;
  }
  return d;
}

function hueWeights(hue, out) {
  for (let h = 0; h < HUES.length; h++) {
    let gap = Math.abs(hue - HUES[h]) % 360;
    if (gap > 180) gap = 360 - gap;
    out[h] = Math.max(0, 1 - gap / HUE_WIDTH);
  }
}

const bearing = new Float32Array(BEARINGS);
const hues = new Float32Array(HUES.length);

export function sense(world, out = new Float32Array(INPUTS)) {
  out.fill(0);
  const m = world.m;
  const eyes = m.asleep ? 0 : 1;
  const add = (index, value) => { out[index] = Math.min(1, out[index] + value); };

  // sight: hue x bearing x range
  if (eyes) {
    const base = OFFSETS["vision.hue"];
    const see = (x, y, hue, strength) => {
      const d = bearings(x - m.x, y - m.y, bearing);
      if (d > BODY.view) return;
      const near = 1 - smooth(BODY.near * 0.8, BODY.near * 1.2, d);
      const far = (1 - near) * (1 - smooth(BODY.view * 0.85, BODY.view, d));
      hueWeights(hue, hues);
      for (let h = 0; h < HUES.length; h++) {
        if (!hues[h]) continue;
        for (let b = 0; b < BEARINGS; b++) {
          if (!bearing[b]) continue;
          const at = base + (h * BEARINGS + b) * 2;
          add(at, strength * hues[h] * bearing[b] * near);
          add(at + 1, strength * hues[h] * bearing[b] * far);
        }
      }
    };
    for (const item of Object.values(world.furniture)) see(item.x, item.y, item.hue, 1);
    const sun = world.sun();
    if (sun.on) see(sun.x, sun.y, 60, 0.8);
    for (const toy of world.toys) see(toy.x, toy.y, toy.hue, toy.sat);
    for (const food of world.foods) see(food.x, food.y, FLAVORS[food.flavor].hue, 0.7);

    const motion = OFFSETS["vision.motion"];
    for (const toy of world.toys) {
      const speed = Math.hypot(toy.vx, toy.vy);
      if (speed < 25) continue;
      const d = bearings(toy.x - m.x, toy.y - m.y, bearing);
      if (d > BODY.view) continue;
      for (let b = 0; b < BEARINGS; b++) add(motion + b, bearing[b] * Math.min(1, speed / 200));
    }

    const hand = world.hand;
    if (hand.present) {
      const at = OFFSETS["vision.hand"];
      const d = bearings(hand.x - m.x, hand.y - m.y, bearing);
      if (d <= BODY.view) {
        const near = 1 - smooth(BODY.near * 0.8, BODY.near * 1.2, d);
        const far = (1 - near) * (1 - smooth(BODY.view * 0.85, BODY.view, d));
        for (let b = 0; b < BEARINGS; b++) { add(at + b * 2, bearing[b] * near); add(at + b * 2 + 1, bearing[b] * far); }
      }
      if (world.handOver()) out[at + 16] = 1;
    }
  }

  // smell: odour bearing and quality, reaching further than sight
  {
    const at = OFFSETS.smell, nose = m.asleep ? 0.5 : 1;
    const quality = { savoury: 8, sweet: 9, bitter: 10 };
    for (const source of world.foodSources()) {
      const d = bearings(source.x - m.x, source.y - m.y, bearing);
      const strength = nose * source.strength / (1 + (d / BODY.smell) ** 2);
      for (let b = 0; b < BEARINGS; b++) add(at + b, bearing[b] * strength);
      out[at + quality[source.taste]] = Math.max(out[at + quality[source.taste]], strength);
    }
  }

  // mouth
  {
    const at = OFFSETS.mouth;
    const reach = source => Math.hypot(source.x - m.x, source.y - m.y) < BODY.radius + source.r + 10;
    if (world.foodSources().some(reach)) out[at] = 1;
    const water = world.furniture.water;
    if (water.level > 1e-6 && reach(water)) out[at + 1] = 1;
    out[at + 2] = m.taste.good;
    out[at + 3] = m.taste.bad;
  }

  // hearing
  {
    const at = OFFSETS.hearing, ears = m.asleep ? 0.6 : 1;
    for (const [token, level] of Object.entries(world.sounds)) {
      for (const cell of SOUNDS[token]) out[at + cell] = Math.max(out[at + cell], ears * level);
    }
  }

  // touch and the body's own state
  {
    const at = OFFSETS.touch, t = m.touch;
    out[at] = t.stroke; out[at + 1] = t.boop; out[at + 2] = m.held ? 1 : 0;
    out[at + 3] = t.wallN; out[at + 4] = t.wallE; out[at + 5] = t.wallS; out[at + 6] = t.wallW;
    out[at + 7] = t.toy;
    out[at + 8] = world.onBed() ? 1 : 0;
    out[at + 9] = world.onSun() ? 1 : 0;
    const p = OFFSETS.proprio;
    out[p] = Math.min(1, Math.hypot(m.vx, m.vy) / BODY.speed);
    out[p + 1] = m.pose === "sit" ? 1 : 0;
    out[p + 2] = m.pose === "lie" ? 1 : 0;
    out[p + 3] = m.asleep ? 1 : 0;
  }

  // needs and light
  {
    const at = OFFSETS.needs;
    NEEDS.forEach((name, i) => {
      const value = m.needs[name];
      NEED_LEVELS.forEach((centre, level) => {
        out[at + i * 3 + level] = Math.max(0, 1 - Math.abs(value - centre) / 0.3);
      });
    });
    const light = world.light();
    out[OFFSETS.light] = light; out[OFFSETS.light + 1] = 1 - light;
  }

  // place cells
  {
    const at = OFFSETS.place, [cols, rows] = PLACE_GRID;
    const sx = (ROOM.w / cols) * 0.6, sy = (ROOM.h / rows) * 0.6;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const dx = (m.x - (i + 0.5) * ROOM.w / cols) / sx, dy = (m.y - (j + 0.5) * ROOM.h / rows) / sy;
      out[at + j * cols + i] = Math.exp(-0.5 * (dx * dx + dy * dy));
    }
  }
  return out;
}

// The slice of an observation that belongs to one sense, for displays and tests.
export function part(observation, name, size) {
  return observation.subarray(OFFSETS[name], OFFSETS[name] + size);
}
