// The brain overlay. Every value drawn here was measured in the brain or the body:
// the neurons' activations at the settling steps that actually ran this decision (the free
// answer first, then any lesson or reward phase), the critic's reward prediction error, the
// body's arousal and sleep pressure, and the policy of the settled motor cortex.
// Nothing is animated from a script; a brain in equilibrium is drawn still.

import { BrainScan, decodeAtlas } from "./brain_scan.js";
import { ACTIONS } from "./spec.js";

const $ = id => document.getElementById(id);
const MODES = {
  routine: ["routine · equilibrium", ""],
  aroused: ["alert · learning", "aroused"],
  guided: ["shown · a lesson", "guided"],
  asleep: ["asleep", "asleep"],
  refused: ["did not settle · holding still", "refused"],
};
const ACTION_NAMES = {
  rest: "rest", north: "walk ↑", northeast: "walk ↗", east: "walk →", southeast: "walk ↘", south: "walk ↓",
  southwest: "walk ↙", west: "walk ←", northwest: "walk ↖", eat: "eat / drink", sleep: "lie down",
  pounce: "pounce", call: "call", sit: "sit", spin: "spin", jump: "jump", paw: "paw",
};
export const actionName = index => ACTION_NAMES[ACTIONS[index]] || ACTIONS[index];

function decodeFrames(spec, n) {
  const text = atob(spec.data), count = Math.floor(text.length / n), out = [];
  for (let f = 0; f < count; f++) {
    const frame = new Float32Array(n);
    for (let i = 0; i < n; i++) frame[i] = (text.charCodeAt(f * n + i) / 255) * 1.1 - 0.1;
    out.push({ kind: spec.kind, frame });
  }
  return out;
}

export class BrainView {
  constructor() {
    this.scan = null;
    this.queue = [];
    this.work = [];
    this.dopamine = 0;
    this.open = true;
    this.style = "brain";
    this.framesWanted = 12;
    this.lastKind = "free";
    this.info = null;
  }

  setAtlas(payload) {
    this.info = payload;
    const atlas = decodeAtlas(payload.atlas);
    const options = {
      style: this.style, labels: $("scanLabels"), strip: $("montage"), spin: true, spinRate: 0.055,
      labelCount: 0, labelTop: 10, heatDecay: 0.9, dpr: 1.5, lineBudget: 14000, particleBudget: 9000,
      montageRows: 9, bloom: 0.5, glow: 2.0, exposure: 0.9, restAlpha: 0.09,
      background: [0.016, 0.027, 0.052], hot: [1.0, 0.84, 0.5], cool: [0.42, 0.68, 1.0],
    };
    this.scan = new BrainScan($("scan"), atlas, options);
    this.scan.fit();
    this.scan.onhover = hit => {
      $("inspector").textContent = hit ? `${hit.region} · neuron ${hit.neuron} · activity ${hit.activation.toFixed(2)}` : "";
    };
    $("brainFacts").textContent =
      `${payload.neurons.toLocaleString()} neurons, ${payload.synapses.toLocaleString()} synapses ` +
      `(${this.scan.edges.toLocaleString()} drawn). One settlement of the whole brain per decision. ` +
      "Glow marks neurons that are changing. Drag to turn, scroll to zoom.";
  }

  toggleStyle() {
    if (!this.scan) return;
    this.style = this.style === "brain" ? "scan" : "brain";
    this.scan.setStyle(this.style);
    this.scan.fit();
    $("brainStyle").textContent = this.style === "brain" ? "Map" : "3D";
  }

  // One decision's measurements: the brain's answer plus the body's state at that moment.
  push(answer, body) {
    const mode = body.asleep && !answer.refused && answer.mode !== "guided" ? "asleep" : (answer.refused ? "refused" : answer.mode);
    const [text, cls] = MODES[mode] || MODES.routine;
    const chip = $("mode");
    chip.textContent = text;
    chip.className = "chip " + cls;
    if (this.scan && this.open) {
      const n = this.scan.n;
      if (answer.frames) for (const spec of answer.frames) this.queue.push(...decodeFrames(spec, n));
      else if (answer.activity) this.queue.push(...decodeFrames({ kind: "free", data: answer.activity }, n));
      if (this.queue.length > 90) this.queue.splice(0, this.queue.length - 90);
    }
    const learning = answer.learning || {};
    this.dopamine = "dopamine" in learning && answer.mode === "aroused" ? learning.dopamine : this.dopamine * 0.6;
    this.signed("mDopamine", this.dopamine, 1, this.dopamine >= 0 ? "#ffd27a" : "#6ea0ff");
    this.level("mArousal", Math.min(1, body.arousal / 2), body.arousal, body.threshold / 2);
    if (answer.value) this.signed("mValue", answer.value[0], 2, "#6ee7d8");
    this.level("mSleep", body.fatigue, body.fatigue);
    if (Math.abs(this.dopamine) > 0.25 && answer.mode === "aroused") this.pulse(this.dopamine > 0 ? "reward" : "pain");
    this.work.push({ sweeps: answer.sweeps || 0, mode });
    if (this.work.length > 140) this.work.shift();
    this.drawWork();
    if (answer.policy) this.intent(answer.policy[0], answer.action ? answer.action[0] : -1);
  }

  pulse(kind) {
    const el = $("pulse");
    el.className = kind;
    clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => { el.className = ""; }, 140);
  }

  signed(id, value, range, colour) {
    const bar = $(id).querySelector("i"), width = Math.min(50, Math.abs(value) / range * 50);
    bar.style.width = width + "%";
    bar.style.left = (value >= 0 ? 50 : 50 - width) + "%";
    bar.style.background = colour;
    $(id).querySelector("b").textContent = (value >= 0 ? "+" : "") + value.toFixed(2);
  }

  level(id, share, value, mark = null) {
    const track = $(id).querySelector(".track");
    track.querySelector("i").style.width = Math.max(0, Math.min(100, share * 100)) + "%";
    const flag = track.querySelector("u");
    if (flag && mark !== null) flag.style.left = Math.min(100, mark * 100) + "%";
    $(id).querySelector("b").textContent = value.toFixed(2);
  }

  intent(policy, chosen) {
    const order = policy.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, 5);
    const host = $("intentBars");
    host.replaceChildren(...order.map(([p, i]) => {
      const row = document.createElement("div");
      row.className = "intent" + (i === chosen ? " chosen" : "");
      row.innerHTML = `<span></span><div class="track"><i style="width:${(p * 100).toFixed(0)}%"></i></div><b>${(p * 100).toFixed(0)}%</b>`;
      row.firstChild.textContent = actionName(i);
      return row;
    }));
  }

  drawWork() {
    const canvas = $("workChart"), rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(54 * dpr); }
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const peak = Math.max(64, ...this.work.map(row => row.sweeps));
    const colours = { routine: "#6ee7d8", aroused: "#ffd27a", guided: "#a999ff", asleep: "#7f93ff", refused: "#ff8f85" };
    const bar = w / 140;
    this.work.forEach((row, i) => {
      const height = Math.max(1, (row.sweeps / peak) * (h - 6));
      ctx.fillStyle = colours[row.mode] || "#6ee7d8";
      ctx.globalAlpha = 0.35 + 0.65 * (i / this.work.length);
      ctx.fillRect(i * bar, h - height, Math.max(1, bar - 1), height);
    });
    ctx.globalAlpha = 1;
    const last = this.work[this.work.length - 1];
    if (last) {
      const routine = this.work.filter(row => row.mode === "routine" || row.mode === "asleep").length / this.work.length;
      $("workCaption").textContent = `settling work: ${last.sweeps} sweeps this decision · ${(routine * 100).toFixed(0)}% of recent decisions answered from routine`;
    }
  }

  // Called every animation frame: plays the settling steps of the last decision, then rests.
  frame(now, stepsPerFrame = 1) {
    if (!this.scan || !this.open) return;
    const take = Math.min(this.queue.length, Math.max(1, Math.ceil(this.queue.length / 8), stepsPerFrame));
    for (let i = 0; i < take; i++) {
      const next = this.queue.shift();
      this.lastKind = next.kind;
      this.scan.step(next.frame, { draw: false });
    }
    this.scan.draw(now);
  }
}
