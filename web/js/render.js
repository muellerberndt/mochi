// Drawing only. Everything here reads the world and the last answer of the brain; nothing here
// decides what Mochi does. Poses follow the action the brain chose, faces follow measured needs.

import { BODY, ROOM, FLAVORS } from "./world.js";

const TAU = Math.PI * 2;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sky(light, tod) {
  if (light >= 1) return ["#bfe3ff", "#e9f6ff"];
  if (light <= 0) return ["#141a3c", "#27305e"];
  return tod < 0.5 ? ["#ffd7b0", "#ffeed8"] : ["#f7a56c", "#ffd9a8"];
}

export function drawRoom(ctx, world, view) {
  const { w, h, wall } = ROOM;
  const light = world.light(), tod = world.tod(), now = view.time;

  // floor and planks
  ctx.fillStyle = "#ecd6b4"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(160,120,80,0.16)"; ctx.lineWidth = 1;
  for (let y = wall; y < h - wall; y += 46) { ctx.beginPath(); ctx.moveTo(wall, y); ctx.lineTo(w - wall, y); ctx.stroke(); }
  for (let y = wall, row = 0; y < h - wall; y += 46, row++) {
    for (let x = wall + (row % 2 ? 90 : 30); x < w - wall; x += 180) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke(); }
  }
  // rug
  roundRect(ctx, 300, 215, 360, 210, 34); ctx.fillStyle = "#f3b8a6"; ctx.fill();
  roundRect(ctx, 316, 231, 328, 178, 26); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.stroke();

  // walls and the window
  ctx.fillStyle = "#c79f77";
  ctx.fillRect(0, 0, w, wall); ctx.fillRect(0, h - wall, w, wall); ctx.fillRect(0, 0, wall, h); ctx.fillRect(w - wall, 0, wall, h);
  ctx.fillStyle = "rgba(90,60,40,0.18)"; ctx.fillRect(wall, wall, w - 2 * wall, 5); ctx.fillRect(wall, wall, 5, h - 2 * wall);
  const [top, bottom] = sky(light, tod);
  const gradient = ctx.createLinearGradient(0, 2, 0, wall - 2);
  gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
  roundRect(ctx, 400, 3, 160, wall - 6, 6); ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = "#8b6747"; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(480, 3); ctx.lineTo(480, wall - 3); ctx.stroke();
  if (light < 0.3) {
    ctx.fillStyle = "rgba(255,255,230,0.9)";
    for (const [sx, sy] of [[418, 10], [446, 17], [468, 8], [500, 14], [528, 9], [546, 18]]) ctx.fillRect(sx, sy, 2, 2);
  }

  // the sun patch
  const sun = world.sun();
  if (light > 0.02) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, sun.rx * 1.25);
    glow.addColorStop(0, `rgba(255,236,150,${0.55 * light})`);
    glow.addColorStop(0.75, `rgba(255,236,150,${0.28 * light})`);
    glow.addColorStop(1, "rgba(255,236,150,0)");
    ctx.save(); ctx.translate(sun.x, sun.y); ctx.scale(1, sun.ry / sun.rx); ctx.translate(-sun.x, -sun.y);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.rx * 1.25, 0, TAU); ctx.fill(); ctx.restore();
  }

  drawFurniture(ctx, world, view);
  for (const food of world.foods) drawTreat(ctx, food.x, food.y, food.flavor);
  for (const toy of world.toys) if (toy.kind !== "wand") drawToy(ctx, toy, now);

  if (view.showSenses) {
    ctx.save(); ctx.setLineDash([6, 8]); ctx.strokeStyle = "rgba(80,90,160,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(world.m.x, world.m.y, BODY.view, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(world.m.x, world.m.y, BODY.near, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  drawMochi(ctx, world, view);
  for (const toy of world.toys) if (toy.kind === "wand") drawWand(ctx, toy, world.hand);
  drawHand(ctx, world, view);

  // night
  if (light < 1) {
    ctx.fillStyle = `rgba(22,26,66,${0.52 * (1 - light)})`; ctx.fillRect(0, 0, w, h);
    if (light < 0.5) {
      const lamp = ctx.createRadialGradient(world.m.x, world.m.y, 10, world.m.x, world.m.y, 170);
      lamp.addColorStop(0, `rgba(255,220,160,${0.16 * (1 - light)})`); lamp.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = lamp; ctx.fillRect(0, 0, w, h);
    }
  }
  drawEmotes(ctx, world, view);
}

function drawFurniture(ctx, world, view) {
  const f = world.furniture;
  const pick = name => (view.rearrange ? "rgba(60,60,60,0.55)" : null);
  // bed: a round basket with a cushion
  ellipse(ctx, f.bed.x, f.bed.y + 4, f.bed.r, f.bed.r * 0.86, "#7d5fa8", pick("bed"));
  ellipse(ctx, f.bed.x, f.bed.y, f.bed.r - 9, f.bed.r * 0.86 - 9, "#b79be0");
  ellipse(ctx, f.bed.x - 8, f.bed.y - 6, f.bed.r - 26, f.bed.r * 0.86 - 24, "#cdb6ee");
  // food bowl
  ellipse(ctx, f.bowl.x, f.bowl.y + 3, f.bowl.r, f.bowl.r * 0.8, "#d9792b", pick("bowl"));
  ellipse(ctx, f.bowl.x, f.bowl.y, f.bowl.r - 6, f.bowl.r * 0.8 - 5, "#f6e3c8");
  const kibble = Math.round(f.bowl.food * 5);
  ctx.fillStyle = "#9a5b2c";
  for (let i = 0; i < kibble; i++) {
    const angle = i * 2.4, radius = 3 + (i % 5) * 3.1;
    ctx.beginPath(); ctx.arc(f.bowl.x + Math.cos(angle) * radius, f.bowl.y + Math.sin(angle) * radius * 0.75, 2.6, 0, TAU); ctx.fill();
  }
  // water dish
  ellipse(ctx, f.water.x, f.water.y + 3, f.water.r, f.water.r * 0.8, "#3f7fd0", pick("water"));
  ellipse(ctx, f.water.x, f.water.y, f.water.r - 5, f.water.r * 0.8 - 4, "#e8f3ff");
  const level = Math.max(0, Math.min(1, f.water.level / 4));
  if (level > 0.01) ellipse(ctx, f.water.x, f.water.y, (f.water.r - 6) * (0.45 + 0.55 * level), (f.water.r * 0.8 - 5) * (0.45 + 0.55 * level), "rgba(110,180,255,0.85)");
  // toy box
  roundRect(ctx, f.box.x - f.box.r, f.box.y - f.box.r * 0.7, f.box.r * 2, f.box.r * 1.4, 8);
  ctx.fillStyle = "#4f9d63"; ctx.fill();
  if (view.rearrange) { ctx.strokeStyle = "rgba(60,60,60,0.55)"; ctx.lineWidth = 2; ctx.stroke(); }
  roundRect(ctx, f.box.x - f.box.r + 7, f.box.y - f.box.r * 0.7 + 7, f.box.r * 2 - 14, f.box.r * 1.4 - 14, 5);
  ctx.fillStyle = "#3b7a4c"; ctx.fill();
  ctx.fillStyle = "#ffe07a"; ctx.font = "20px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("★", f.box.x, f.box.y + 1);
}

function drawTreat(ctx, x, y, flavor) {
  if (flavor === "cookie") {
    ellipse(ctx, x, y, 9, 8, "#c98a4b", "#8f5a2a", 1.5);
    ctx.fillStyle = "#5b3516"; for (const [dx, dy] of [[-3, -2], [3, 1], [-1, 3]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.5, 0, TAU); ctx.fill(); }
  } else if (flavor === "fish") {
    ellipse(ctx, x - 1, y, 9, 5, "#6fa8e6", "#3d6fae", 1.5);
    ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 13, y - 5); ctx.lineTo(x + 13, y + 5); ctx.closePath(); ctx.fillStyle = "#6fa8e6"; ctx.fill();
    ctx.fillStyle = "#1d2f4a"; ctx.beginPath(); ctx.arc(x - 5, y - 1, 1.2, 0, TAU); ctx.fill();
  } else {
    ellipse(ctx, x, y, 10, 7, "#f4dc4a", "#b79c1c", 1.5);
    ctx.fillStyle = "#b79c1c"; ctx.beginPath(); ctx.arc(x + 9, y, 1.6, 0, TAU); ctx.fill();
  }
}

function drawToy(ctx, toy, now) {
  ellipse(ctx, toy.x + 2, toy.y + toy.r * 0.75, toy.r * 0.9, toy.r * 0.35, "rgba(60,40,30,0.18)");
  if (toy.kind === "ball") {
    const spin = (toy.x + toy.y) / 14;
    ellipse(ctx, toy.x, toy.y, toy.r, toy.r, hsl(toy.hue, 78, 58), hsl(toy.hue, 60, 38), 1.5);
    ctx.save(); ctx.translate(toy.x, toy.y); ctx.rotate(spin);
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, toy.r * 0.62, -0.5, 1.2); ctx.stroke(); ctx.restore();
  } else {
    const angle = Math.atan2(toy.vy, toy.vx || 1e-6);
    ctx.save(); ctx.translate(toy.x, toy.y); ctx.rotate(toy.charge > 0 ? angle : 0);
    ctx.strokeStyle = "#8a6f66"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-toy.r, 0); ctx.quadraticCurveTo(-toy.r - 10, Math.sin(now * 14) * 5, -toy.r - 16, 0); ctx.stroke();
    ellipse(ctx, 0, 0, toy.r, toy.r * 0.72, "#b9a9a5", "#8a6f66", 1.5);
    ellipse(ctx, toy.r * 0.35, -toy.r * 0.6, 4, 4, "#e7b7b0", "#8a6f66", 1);
    ctx.fillStyle = "#3b2c2a"; ctx.beginPath(); ctx.arc(toy.r * 0.6, -1, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawWand(ctx, toy, hand) {
  if (hand.present) {
    ctx.strokeStyle = "rgba(120,90,70,0.8)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo((hand.x + toy.x) / 2 + 8, (hand.y + toy.y) / 2 - 6, toy.x, toy.y); ctx.stroke();
  }
  ctx.save(); ctx.translate(toy.x, toy.y); ctx.rotate(Math.atan2(toy.vy, toy.vx || 1e-6) + Math.PI / 2);
  for (const [dx, tint] of [[-5, 62], [0, 70], [5, 62]]) ellipse(ctx, dx, 0, 4, 11, hsl(330, 80, tint), hsl(330, 55, 45), 1);
  ctx.restore();
}

function drawHand(ctx, world, view) {
  const hand = world.hand;
  if (!hand.present || view.hideHand) return;
  const x = hand.x, y = hand.y;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ellipse(ctx, x, y + 2, 13, 11, "#ffd9bf", "#b8876a", 1.5);
  for (const dx of [-9, -3, 3, 9]) ellipse(ctx, x + dx, y - 9, 3.4, 6, "#ffd9bf", "#b8876a", 1.2);
  ctx.restore();
  const held = hand.holding;
  if (held && held.kind === "treat") drawTreat(ctx, x, y - 2, held.flavor);
  if (hand.petting && world.handOver()) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 3; i++) { const a = view.time * 6 + i * 2.1; ctx.fillRect(x + Math.cos(a) * 20, y + Math.sin(a) * 14, 2.5, 2.5); }
  }
}

// ------------------------------------------------------------------ Mochi
// Mochi's coat takes the palette of the Solana mark: violet at the lower back running through
// blue to green at the brow, drawn with a near-black line as the mark sits on black.
export const COAT = {
  stops: [[0, "#9945FF"], [0.5, "#5A8FE0"], [1, "#14F195"]],
  line: "#0d0a1a", ear: "#c9ffe9", earBack: "#4f9fd6", earFront: "#22e0a0", eye: "#0b0714",
  blush: "220,31,255", mouth: "#2a0f4a",
};
const LOOK = 1.22;                            // drawn a little larger than the body's physics
function shadeOf(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const part = shift => Math.round(((value >> shift) & 255) * (1 - amount));
  return `rgb(${part(16)},${part(8)},${part(0)})`;
}

export function drawMochi(ctx, world, view) {
  const m = world.m, t = view.time, pose = m.pose, n = m.needs;
  const r = BODY.radius;
  const speed = Math.hypot(m.vx, m.vy) / BODY.speed;
  let lift = 0, squashX = 1, squashY = 1, rotation = 0, bob = 0, dip = 0;
  const breath = Math.sin(t * (m.asleep ? 1.4 : 2.6)) * 0.02;
  if (pose === "walk") bob = Math.sin(t * 13) * 2.2 * Math.min(1, speed * 1.4);
  if (pose === "sit") { squashY = 0.9; squashX = 1.04; }
  if (pose === "lie") { squashY = 0.62; squashX = 1.2; }
  if (pose === "eat" || pose === "drink" || pose === "sniff") dip = Math.abs(Math.sin(t * (pose === "sniff" ? 9 : 12))) * 4;
  if (pose === "jump") { lift = 30 * Math.abs(Math.sin(Math.min(1, m.actionT / 0.45) * Math.PI)); squashY = 1.06; }
  if (pose === "spin") rotation = (m.actionT / 0.6) * TAU;
  if (pose === "pounce") { squashX = 1.12; squashY = 0.9; }
  if (pose === "held") { squashX = 0.9; squashY = 1.14; lift = 8; }
  squashY += breath; squashX -= breath * 0.6;

  const facing = Math.cos(m.heading) < 0 ? -1 : 1;
  const x = m.x, y = m.y - lift + bob;
  const line = COAT.line, ear = COAT.ear;

  // shadow
  ellipse(ctx, m.x, m.y + r * 0.72 * LOOK, r * LOOK * (0.95 - lift / 120), r * 0.3 * LOOK * (1 - lift / 90), "rgba(70,45,30,0.2)");

  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation * facing);
  ctx.scale(facing * squashX * LOOK, squashY * LOOK);
  // the coat: one gradient across the whole body, from the lower back to the brow
  const coat = (dark = 0) => {
    const gradient = ctx.createLinearGradient(-r * 1.2, r, r * 1.1, -r * 1.1);
    COAT.stops.forEach(([at, colour]) => gradient.addColorStop(at, dark ? shadeOf(colour, dark) : colour));
    return gradient;
  };
  const fur = coat(), shade = coat(0.22);

  // tail
  const wag = Math.sin(t * (n.boredom > 0.6 ? 9 : 3.2)) * (pose === "lie" ? 2 : 6);
  ctx.strokeStyle = line; ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-r * 0.78, 6); ctx.quadraticCurveTo(-r * 1.25, 4 + wag, -r * 1.28, -10 + wag); ctx.stroke();
  ctx.strokeStyle = COAT.stops[0][1]; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-r * 0.78, 6); ctx.quadraticCurveTo(-r * 1.25, 4 + wag, -r * 1.28, -10 + wag); ctx.stroke();

  // feet
  if (pose === "walk" || pose === "stand" || pose === "held" || pose === "jump") {
    const stride = pose === "walk" ? Math.sin(t * 13) * 5 : 0;
    const hang = pose === "held" ? 6 : 0;
    for (const [fx, phase] of [[-12, 1], [12, -1]]) ellipse(ctx, fx + stride * phase, r * 0.78 + hang, 7, 5, shade, line, 1.5);
  }

  // ears
  const perk = pose === "sit" || view.alert > 0.4 ? -3 : (m.asleep ? 4 : 0);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * r * 0.52, -r * 0.74 + perk); ctx.rotate(side * (0.38 + (m.asleep ? 0.35 : 0)));
    ellipse(ctx, 0, 0, 8, 13, side < 0 ? COAT.earBack : COAT.earFront, line, 2); ellipse(ctx, 0, 2, 4, 8, ear);
    ctx.restore();
  }

  // body
  ellipse(ctx, 0, dip * 0.5, r, r * 0.92, fur, line, 2.2);
  ellipse(ctx, -4, r * 0.3 + dip * 0.5, r * 0.62, r * 0.42, "rgba(255,255,255,0.2)");
  ellipse(ctx, r * 0.18, -r * 0.42 + dip * 0.5, r * 0.5, r * 0.2, "rgba(255,255,255,0.16)");

  // paw wave
  if (pose === "paw") {
    const wave = Math.sin(t * 16) * 5;
    ellipse(ctx, r * 0.7, -r * 0.12 + wave, 7, 6, fur, line, 1.8);
  }

  // face
  const fy = -3 + dip;
  const look = view.look || [0, 0];
  const ex = look[0] * facing * 2.4, ey = look[1] * 2;
  const closed = m.asleep || view.blink || (pose === "lie" && Math.sin(t * 0.9) > 0.2);
  ctx.fillStyle = COAT.eye; ctx.strokeStyle = COAT.eye; ctx.lineWidth = 2; ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const cx = side * 9 + 3;
    if (closed || m.touch.stroke > 0.4) {
      ctx.beginPath(); ctx.arc(cx, fy, 4, 0.15 * Math.PI, 0.85 * Math.PI, m.touch.stroke > 0.4 && !m.asleep); ctx.stroke();
    } else {
      const wide = 3.4 + view.alert * 1.6;
      ctx.beginPath(); ctx.ellipse(cx + ex, fy + ey, wide * 0.85, wide, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + ex + 1, fy + ey - 1.2, 1.1, 0, TAU); ctx.fill(); ctx.fillStyle = COAT.eye;
    }
  }
  // cheeks
  const blush = 0.3 + 0.5 * Math.min(1, m.touch.stroke + (m.taste.good || 0));
  ellipse(ctx, -13, fy + 7, 5, 3.2, `rgba(${COAT.blush},${blush})`); ellipse(ctx, 19, fy + 7, 5, 3.2, `rgba(${COAT.blush},${blush})`);
  // mouth
  ctx.beginPath();
  if (pose === "call") { ctx.ellipse(3, fy + 9, 3.2, 4.2, 0, 0, TAU); ctx.fillStyle = COAT.mouth; ctx.fill(); }
  else if (pose === "eat" || pose === "drink") { ctx.ellipse(3, fy + 9, 3 + Math.sin(t * 24), 2.4, 0, 0, TAU); ctx.fillStyle = COAT.mouth; ctx.fill(); }
  else if (m.taste.bad > 0.3) { ctx.moveTo(-1, fy + 11); ctx.quadraticCurveTo(3, fy + 7, 7, fy + 11); ctx.stroke(); }
  else { ctx.moveTo(-1, fy + 8); ctx.quadraticCurveTo(1, fy + 11, 3, fy + 8); ctx.quadraticCurveTo(5, fy + 11, 7, fy + 8); ctx.stroke(); }
  ctx.restore();

  if (m.asleep) {
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.5 + i * 0.33) % 1;
      ctx.font = `${10 + phase * 9}px system-ui`;
      ctx.globalAlpha = 1 - phase;
      ctx.fillText("z", m.x + 24 + phase * 16, m.y - 26 - phase * 30);
    }
    ctx.globalAlpha = 1;
  }
}

function drawEmotes(ctx, world, view) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const thought = view.thought;
  if (thought && view.time - thought.at < 1.4 && !world.m.asleep) {
    const age = (view.time - thought.at) / 1.4, bx = world.m.x + 34, by = world.m.y - 50;
    ctx.globalAlpha = Math.min(1, 3 * (1 - age));
    ellipse(ctx, bx, by, 17, 14, "rgba(255,255,255,0.95)", "rgba(13,10,26,0.5)", 1.5);
    ellipse(ctx, bx - 14, by + 15, 4, 3.4, "rgba(255,255,255,0.95)", "rgba(13,10,26,0.5)", 1.2);
    ctx.font = "16px system-ui"; ctx.fillStyle = "#0d0a1a";
    ctx.fillText(thought.icon, bx, by + 1);
    ctx.globalAlpha = 1;
  }
  view.emotes = view.emotes.filter(emote => view.time - emote.at < 1.6);
  for (const emote of view.emotes) {
    const age = (view.time - emote.at) / 1.6;
    ctx.globalAlpha = 1 - age * age;
    ctx.font = `${emote.size || 22}px system-ui`;
    ctx.fillStyle = emote.color || "#e2557b";
    ctx.fillText(emote.text, world.m.x + (emote.dx || 0), world.m.y - 44 - age * 34);
  }
  ctx.globalAlpha = 1;
}

export function treatHue(flavor) { return FLAVORS[flavor].hue; }
