// The page: the room at 60 frames a second, the hand, the voice, and the line to the brain.
// The brain decides every 0.15 s of world time in a worker; the body keeps its last action
// until the answer arrives, and the world waits at the next decision if the brain is still
// settling, so no outcome is ever credited to a decision that was not executed.

import { World, DT, TICK_STEPS, ROOM, BODY } from "./world.js";
import { sense } from "./senses.js";
import { Arousal } from "./arousal.js";
import { A, ACTIONS, HEARING, OFFSETS, SOUNDS, SPEC, TRICKS, WORDS } from "./spec.js";
import { drawRoom } from "./render.js";
import { BrainLink, brainIndex } from "./brainlink.js";
import { BrainView, actionName } from "./brainview.js";
import { Sound } from "./audio.js";
import { saveLife, loadLife, forgetLife, lifeToBlob, blobToLife } from "./storage.js";

const $ = id => document.getElementById(id);
const canvas = $("room"), ctx = canvas.getContext("2d");
const VERSION = "mochi-page/2";               // of the saved room and page state; the brain is versioned by its pack
const YOUTH_TICKS = 0;                       // a hatchling from the packaged brain is already weaned

const view = { time: 0, emotes: [], look: [0, 0], alert: 0, blink: false, showSenses: false, rearrange: false, hideHand: false };
const sound = new Sound();
const brainView = new BrainView();
const observation = new Float32Array(SPEC.inputs);

let world = new World({ seed: (Date.now() % 100000) + 1, tod: 0.02 });
let arousal = new Arousal();
let brain = null;
let ready = false, inFlight = false, paused = false;
let steps = TICK_STEPS, bank = 0, last = performance.now(), ticks = 0, latency = 0;
let show = null;                              // the action the player is showing, or null
let showUntil = 0;
let ask = null;                               // {word, left, shown}
let probeAt = 0, probeWord = 0, sleptThisNight = false, asleepTicks = 0;
const THOUGHTS = { eat: "🍽", sleep: "💤", pounce: "🎾", call: "📣", sit: "🪑", spin: "🌀", jump: "⤴", paw: "🐾" };
let lastChosen = -1, frames = 0, stride = 1;
let quiet = null;                             // the last silent moment answered with an everyday action
let dirty = false, calmNow = false, savedAt = 0, saving = false;
const silent = obs => { for (let cell = 0; cell < HEARING; cell++) if (obs[OFFSETS.hearing + cell] > 0.05) return false; return true; };
let pointer = { x: 480, y: 300, inside: false, down: false, trail: [] };
let drag = null;                              // {kind: "toy"|"pet"|"carry"|"treat"|"furniture", ...}
let wandId = null;

const page = {
  name: "Mochi", tool: "pet", speed: 1, skipNight: true,
  words: WORDS.map((_, i) => ({ label: ["sit", "spin", "hop", "paw"][i], asked: 0, recent: [], would: null, memory: null })),
  todo: {}, diary: [], decisions: 0, routine: 0, lessons: 0,
};
const TODO = [
  ["pet", "Stroke Mochi until it closes its eyes"],
  ["handfed", "Offer a treat from your hand"],
  ["played", "Throw the ball and watch a pounce"],
  ["shown", "Say a word and show Mochi a move"],
  ["answered", "Hear Mochi answer a word three times running"],
  ["slept", "Let Mochi sleep on a lesson"],
  ["lemon", "See what a lemon does"],
  ["moved", "Move the bowl and watch Mochi find it"],
];

// ------------------------------------------------------------------ small helpers
function toast(text) {
  const el = $("toast");
  el.textContent = text; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}
function emote(text, options = {}) { view.emotes.push({ text, at: view.time, ...options }); }
const lastNote = {};
function diary(text, key = text, gap = 6) {
  if (lastNote[key] !== undefined && world.t - lastNote[key] < gap) return;
  lastNote[key] = world.t;
  page.diary.unshift({ clock: world.clock(), day: world.day + 1, text });
  page.diary.length = Math.min(page.diary.length, 60);
  $("diary").replaceChildren(...page.diary.map(row => {
    const div = document.createElement("div"), time = document.createElement("time");
    time.textContent = row.clock; div.append(time, row.text);
    return div;
  }));
}
function done(key) {
  if (page.todo[key]) return;
  page.todo[key] = true;
  renderTodo();
  toast("✓ " + TODO.find(row => row[0] === key)[1]);
}
function renderTodo() {
  $("todo").replaceChildren(...TODO.map(([key, text]) => {
    const li = document.createElement("li");
    li.textContent = text; if (page.todo[key]) li.className = "done";
    return li;
  }));
}
const round = values => Array.from(values, value => Math.round(value * 1e4) / 1e4);

// ------------------------------------------------------------------ boot
function bootStatus(text, share) {
  $("bootText").textContent = text;
  if (share !== undefined) $("bootBar").style.width = `${Math.round(share * 100)}%`;
}
const STAGES = { "reading the brain pack": 0.08, "loading Python": 0.15, "loading numpy": 0.4, "loading the brain's own code": 0.7 };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.arrayBuffer();
}

async function boot() {
  buildControls();
  renderTodo();
  try {
    // A life keeps the brain pack it was born from; a new life starts from the default pack.
    const index = await brainIndex();
    const wanted = new URLSearchParams(location.search).get("pack");
    let saved = null;
    try { saved = await loadLife(); } catch (error) { console.warn("no saved life", error); }
    if (saved && (saved.version !== VERSION || (wanted && wanted !== saved.pack))) saved = null;
    const known = id => index.packs.some(pack => pack.id === id);
    if (saved && !known(saved.pack)) { toast(`The brain pack ${saved.pack} of the saved life is not installed here.`); saved = null; }
    const packId = saved ? saved.pack : (wanted && known(wanted) ? wanted : index.default);
    brain = new BrainLink(stage => bootStatus(stage, STAGES[stage] ?? 0.6));
    const manifest = await brain.start(packId, index.packs.find(pack => pack.id === packId).url);
    if (!same(manifest.spec, SPEC)) throw new Error(`the pack ${packId} was raised for another body (its senses or actions differ from this page)`);
    page.pack = packId;
    let report = null;
    if (saved) {
      bootStatus(`waking ${saved.page.name}`, 0.8);
      try {
        report = await brain.call({ op: "boot", spec: SPEC, bytes: saved.brain.slice(0) });
        restore(saved);
        diary("woke up at home again", "resume", 0);
      } catch (error) {
        console.warn("the saved life could not be woken", error);
        toast("The saved pet could not be woken on this build. A new one hatches; the old one stays in its backup.");
        report = null;
      }
    }
    if (!report) {
      bootStatus("waking a young Mochi", 0.8);
      const bytes = await fetchBytes(brain.asset(manifest.life));
      if (!bytes) throw new Error(`the pack ${packId} has no life file`);
      report = await brain.call({ op: "boot", spec: SPEC, bytes }, [bytes]);
      if (manifest.raised && manifest.raised.untrained) toast("This pack holds an untrained brain: it starts knowing nothing.");
      world.spawnToy("ball", 300, 420).seen = 60;       // its own ball is nothing new
      diary("hatched", "hatched", 0);
      setTimeout(() => toast("This is Mochi. It lives its own day: stroke it, feed it, teach it a word."), 1200);
    }
    bootStatus("drawing the brain", 0.92);
    let atlas = null;
    try { const response = await fetch(brain.asset(manifest.atlas)); if (response.ok) atlas = await response.json(); } catch (error) { atlas = null; }
    if (!atlas || atlas.neurons !== report.report.neurons) atlas = await brain.call({ op: "atlas" });
    brainView.setAtlas(atlas);
    $("about").textContent =
      `Brain pack ${manifest.name} (${manifest.id}), raised on Cadence ${manifest.cadence}: ` +
      `${report.report.neurons.toLocaleString()} neurons and ${report.report.synapses.toLocaleString()} synapses ` +
      "settle together for every decision. It learns while it lives: from what its actions bring and from what you show it, and it keeps what it learned.";
    const picker = $("packs");
    picker.replaceChildren(...index.packs.map(pack => {
      const option = document.createElement("option");
      option.value = pack.id; option.textContent = `${pack.name} · Cadence ${pack.cadence} · ${pack.neurons.toLocaleString()} neurons`;
      option.selected = pack.id === index.default;
      return option;
    }));
    ready = true;
    $("boot").classList.add("done");
  } catch (error) {
    console.error(error);
    bootStatus(`the brain did not start: ${error.message}`, 1);
  }
}

// ------------------------------------------------------------------ deciding
async function decide() {
  const outcome = world.takeOutcome();
  const m = world.m;
  const wake = arousal.update(outcome, world.novelty(), m.needs) || ticks < YOUTH_TICKS;
  const showing = show !== null ? show : null;
  sense(world, observation);
  // The brain view shows the settling steps that really ran. Recording them costs time, so a
  // slow machine records fewer decisions (always the ones that learn) and shows the settled
  // state of the others.
  const every = latency > 120 ? 6 : latency > 80 ? 3 : latency > 50 ? 2 : 1;
  const record = brainView.open && (ticks % every === 0 || (every < 6 && (wake || showing !== null)));
  const sent = round(observation);
  const message = {
    op: "tick", obs: [sent], reward: [outcome.reward],
    salience: [Math.abs(outcome.reward) + outcome.emphasis], aroused: wake,
    want: { policy: true, learning: true, frames: record ? brainView.framesWanted : 0, activity: brainView.open && !record },
  };
  if (showing !== null) {
    // A shown move is a lesson for this very moment. While a sound rings, the lesson's other
    // half is the last quiet moment Mochi lived and answered with an everyday action, so the
    // move attaches to the sound and not to the room.
    message.guide = [showing]; message.margin = 2;
    if (quiet && ticks - quiet.at < 80 && !silent(sent)) message.contrast = { obs: quiet.obs, action: quiet.action };
  }
  inFlight = true;
  const started = performance.now();
  let answer;
  try { answer = await brain.call(message); }
  catch (error) { console.error(error); inFlight = false; toast("the brain reported an error"); return; }
  inFlight = false;
  latency += 0.1 * (performance.now() - started - latency);
  ticks += 1; page.decisions += 1;
  if (answer.mode === "routine") page.routine += 1;
  if (answer.lesson && answer.lesson.taught) page.lessons += 1;

  if (show !== null) world.setAction(show);
  else world.setAction(answer.refused ? A.rest : answer.action[0]);
  if (!answer.refused && answer.mode !== "guided" && silent(sent) && answer.own[0] < A.sit) quiet = { obs: [sent], action: [answer.own[0]], at: ticks };
  if (answer.lesson && answer.lesson.taught) { dirty = true; brainView.pulse("memory"); }
  if (outcome.emphasis > 0) dirty = true;
  calmNow = answer.mode === "routine";
  if (show !== null && ticks >= showUntil && !showHeld) show = null;

  watchAnswer(answer);
  // a thought bubble for what it has just decided to do, when that is more than walking or resting
  if (!answer.refused && show === null) {
    const chosen = answer.action[0];
    if (chosen !== lastChosen && THOUGHTS[ACTIONS[chosen]]) view.thought = { icon: THOUGHTS[ACTIONS[chosen]], at: view.time };
    lastChosen = chosen;
  }
  $("brainStats").textContent =
    `${page.decisions.toLocaleString()} decisions · ${Math.round(100 * page.routine / Math.max(1, page.decisions))}% from routine · ` +
    `${page.lessons} lessons · ${latency.toFixed(0)} ms per decision`;
  view.alert += 0.3 * (Math.min(1, arousal.level) - view.alert);
  brainView.push(answer, { asleep: m.asleep, arousal: arousal.level, threshold: arousal.genes.threshold, fatigue: m.needs.fatigue });

  // a night's sleep: once Mochi has slept a while, the stores consolidate
  asleepTicks = m.asleep ? asleepTicks + 1 : 0;
  if (!m.asleep && world.light() > 0.5) sleptThisNight = false;
  if (asleepTicks === 40 && !sleptThisNight) {
    sleptThisNight = true;
    brain.call({ op: "sleep" }).then(result => {
      const held = Object.values(result.held || {}).reduce((sum, value) => sum + value, 0);
      if (held > 0.05) { diary("slept on what today brought", "consolidated", 0); brainView.pulse("memory"); if (page.lessons) done("slept"); }
      dirty = true;
    });
  }
  if (ticks >= probeAt) { probeAt = ticks + 12; probe(); }
}

// What does Mochi do after a word? The first move it makes of its own within 1.5 s is its answer.
function watchAnswer(answer) {
  if (!ask || answer.refused) return;
  if (answer.mode === "guided") { ask.shown = true; return; }
  const own = answer.own[0];
  const answering = own >= A.sit || own === A.call || own === A.pounce || own === A.sleep;
  ask.left -= 1;
  if (!answering && ask.left > 0) return;
  const word = page.words[ask.word];
  if (!ask.shown) {
    word.asked += 1;
    word.recent.push(answering ? own : -1);
    if (word.recent.length > 10) word.recent.shift();
    if (answering) diary(`heard "${word.label}" and answered: ${actionName(own)}`, `answer${ask.word}`, 1);
    const tail = word.recent.slice(-3);
    if (tail.length === 3 && tail[0] >= 0 && tail.every(value => value === tail[0])) done("answered");
  }
  ask = null;
  renderWords();
}

// Private imagination: what would Mochi do if it heard each word now? Nothing is lived or learned.
async function probe() {
  const index = probeWord; probeWord = (probeWord + 1) % WORDS.length;
  const heard = Float32Array.from(observation);
  for (let cell = 0; cell < HEARING; cell++) heard[OFFSETS.hearing + cell] = 0;
  for (const cell of SOUNDS[WORDS[index]]) heard[OFFSETS.hearing + cell] = 1;
  try {
    const [answer, memory] = await Promise.all([
      brain.call({ op: "probe", obs: [round(heard)] }),
      brain.call({ op: "recall", obs: [round(heard)] }),
    ]);
    const word = page.words[index], result = answer.answers[0];
    if (result.qualified) {
      const tricks = result.policy.map((p, i) => [p, i]).filter(([, i]) => i >= A.sit || i === A.call);
      tricks.sort((a, b) => b[0] - a[0]);
      word.would = { action: tricks[0][1], share: tricks[0][0], top: result.action };
      const pick = store => (memory[store] ? { lasting: memory[store].lasting[0][tricks[0][1]], fresh: memory[store].fresh[0][tricks[0][1]] } : null);
      word.memory = { shown: pick("shown"), outcome: pick("outcome") };
    }
    renderWords();
  } catch (error) { console.warn(error); }
}

// ------------------------------------------------------------------ controls
let showHeld = false;
function buildControls() {
  const words = $("words");
  page.words.forEach((word, i) => {
    const box = document.createElement("span"); box.className = "word"; box.id = `word${i}`;
    const say = document.createElement("button"); say.textContent = `🗣 ${i + 1}`; say.title = `Say this word (${i + 1})`;
    say.onclick = () => sayWord(i);
    const label = document.createElement("input"); label.value = word.label; label.maxLength = 10; label.spellcheck = false;
    label.oninput = () => { word.label = label.value || `word ${i + 1}`; renderWords(); };
    box.append(say, label); words.append(box);
  });
  const shows = $("shows");
  TRICKS.forEach(trick => {
    const button = document.createElement("button"); button.textContent = trick; button.title = `Hold to move Mochi through "${trick}"`;
    const start = event => {
      event.preventDefault();
      if (!ready) return;
      show = A[trick]; showHeld = true; showUntil = ticks + 3;
      world.setAction(show); button.classList.add("held");
      const ringing = WORDS.findIndex(word => (world.sounds[word] || 0) > 0.05);
      if (ask) ask.shown = true;
      if (ringing >= 0) { diary(`was shown "${trick}" while "${page.words[ringing].label}" rang`, `shown${ringing}${trick}`, 2); done("shown"); }
      else toast("Say a word first (keys 1 to 4), then hold the move while it rings.");
    };
    const stop = () => { showHeld = false; button.classList.remove("held"); if (ticks >= showUntil) show = null; };
    button.addEventListener("pointerdown", start);
    for (const name of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(name, stop);
    shows.append(button);
  });
  for (const button of document.querySelectorAll(".tool")) button.onclick = () => setTool(button.dataset.tool);
  for (const button of document.querySelectorAll("#speed button")) {
    button.onclick = () => {
      const speed = Number(button.dataset.speed);
      paused = speed === 0; if (speed) page.speed = speed;
      for (const other of document.querySelectorAll("#speed button")) other.classList.toggle("on", other === button);
    };
  }
  $("whistle").onclick = () => { world.whistle(); sound.whistle(); };
  $("clap").onclick = () => { world.clap(); sound.clap(); emote("!", { color: "#d1594f" }); };
  $("good").onclick = () => { world.praise(); sound.good(); emote("♥"); diary(`was praised for: ${actionName(world.m.action)}`, "good", 2); };
  $("no").onclick = () => { world.scold(); sound.no(); emote("✗", { color: "#d1594f" }); diary(`was told No while it did: ${actionName(world.m.action)}`, "no", 2); };
  $("addBall").onclick = () => { world.spawnToy("ball", 200 + Math.random() * 560, 150 + Math.random() * 300, { hue: [0, 330, 15][world.toys.length % 3] }); };
  $("addMouse").onclick = () => { const toy = world.spawnToy("mouse", 200 + Math.random() * 560, 150 + Math.random() * 300); world.windMouse(toy.id); };
  $("sound").onclick = () => { sound.enable(!sound.on); $("sound").textContent = sound.on ? "🔊" : "🔈"; };
  $("brainToggle").onclick = toggleBrain; $("brainClose").onclick = toggleBrain;
  $("brainStyle").onclick = () => brainView.toggleStyle();
  $("brainWide").onclick = () => { $("brain").classList.toggle("wide"); if (brainView.scan) setTimeout(() => brainView.scan.fit(), 60); };
  $("save").onclick = () => save(true);
  $("menu").onclick = () => $("more").showModal();
  $("closeMore").onclick = () => $("more").close();
  $("load").onclick = async () => { const saved = await loadLife(); if (!saved) { toast("no saved life here"); return; } await adopt(saved); $("more").close(); };
  $("newLife").onclick = async () => {
    if (!confirm(`Hatch a new Mochi? ${page.name} stays only if you exported it.`)) return;
    await forgetLife();
    const url = new URL(location.href); url.searchParams.set("pack", $("packs").value);
    location.href = url.href;
  };
  $("exportLife").onclick = async () => {
    const life = await snapshot();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(lifeToBlob(life)); link.download = `${page.name || "mochi"}.mochi`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  };
  $("importLife").onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try { await adopt(await blobToLife(file)); $("more").close(); } catch (error) { toast(error.message); }
  };
  $("autoCare").onchange = event => { world.autoCare = event.target.checked; };
  $("showSenses").onchange = event => { view.showSenses = event.target.checked; };
  $("skipNight").onchange = event => { page.skipNight = event.target.checked; };
  $("name").oninput = event => { page.name = event.target.value || "Mochi"; document.title = page.name; };
  document.body.classList.add("brain-open");
  if (new URLSearchParams(location.search).get("brain") === "0") toggleBrain();
  window.addEventListener("keydown", event => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (key >= "1" && key <= "4") sayWord(Number(key) - 1);
    else if (key === "g") $("good").click();
    else if (key === "n") $("no").click();
    else if (key === "w") $("whistle").click();
    else if (key === "c") $("clap").click();
    else if (key === "b") toggleBrain();
    else if (key === " ") { event.preventDefault(); document.querySelector(`#speed button[data-speed="${paused ? page.speed : 0}"]`).click(); }
  });
  renderWords();
}

function toggleBrain() {
  brainView.open = !brainView.open;
  $("brain").classList.toggle("open", brainView.open);
  $("brainToggle").classList.toggle("on", brainView.open);
  document.body.classList.toggle("brain-open", brainView.open);
  if (brainView.open && brainView.scan) setTimeout(() => brainView.scan.fit(), 60);
}

function sayWord(index) {
  if (!ready) return;
  world.say(WORDS[index]); sound.word(index);
  ask = { word: index, left: 10, shown: show !== null };
  const box = $(`word${index}`); box.classList.add("ringing");
  setTimeout(() => box.classList.remove("ringing"), 900);
  emote("♪", { color: "#7d5fa8", dx: 26, size: 18 });
}

function setTool(tool) {
  page.tool = tool;
  for (const button of document.querySelectorAll(".tool")) button.classList.toggle("on", button.dataset.tool === tool);
  view.rearrange = tool === "move";
  if (tool !== "wand" && wandId !== null) { world.removeToy(wandId); wandId = null; }
  if (tool === "wand" && wandId === null) wandId = world.spawnToy("wand", pointer.x, pointer.y + 26).id;
  world.holdNothing();
}

function renderWords() {
  $("wordBook").replaceChildren(...page.words.map((word, i) => {
    const card = document.createElement("div"); card.className = "wordCard";
    const counts = {};
    for (const value of word.recent) counts[value] = (counts[value] || 0) + 1;
    const best = Object.entries(counts).filter(([key]) => Number(key) >= 0).sort((a, b) => b[1] - a[1])[0];
    const heard = word.asked ? (best ? `${actionName(Number(best[0]))} ${best[1]} of the last ${word.recent.length}` : `no answer in the last ${word.recent.length}`) : "never asked";
    const would = word.would ? `would ${actionName(word.would.top)} now` : "";
    const top = document.createElement("div"); top.className = "top";
    const name = document.createElement("b"); name.textContent = `${i + 1} · ${word.label}`;
    const answer = document.createElement("span"); answer.className = "answer"; answer.textContent = heard;
    top.append(name, answer); card.append(top);
    if (would) { const line = document.createElement("div"); line.className = "answer"; line.textContent = would; card.append(line); }
    const memory = word.memory && (word.memory.shown || word.memory.outcome);
    if (memory) {
      const bars = document.createElement("div"); bars.className = "bars";
      const row = (label, value, cls) => {
        const text = document.createElement("span"); text.textContent = label;
        const bar = document.createElement("div"); bar.className = "bar " + cls;
        const fill = document.createElement("i"); fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
        bar.append(fill); bars.append(text, bar);
      };
      row("lasting", memory.lasting, ""); row("fresh", memory.fresh, "fresh");
      card.append(bars);
    }
    return card;
  }));
}

// ------------------------------------------------------------------ the hand
function toRoom(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * ROOM.w, y: (event.clientY - rect.top) / rect.height * ROOM.h };
}
const near = (item, p, extra = 8) => Math.hypot(item.x - p.x, item.y - p.y) < (item.r || 12) + extra;

canvas.addEventListener("pointerdown", event => {
  if (!ready) return;
  canvas.setPointerCapture(event.pointerId);
  const p = toRoom(event);
  pointer = { ...pointer, ...p, inside: true, down: true, trail: [{ ...p, t: performance.now() }] };
  world.moveHand(p.x, p.y, true);
  const tool = page.tool;
  if (tool === "move") {
    const name = Object.keys(world.furniture).find(key => near(world.furniture[key], p, 4));
    if (name) drag = { kind: "furniture", name };
    return;
  }
  if (tool === "cookie" || tool === "fish" || tool === "lemon") { world.holdTreat(tool); drag = { kind: "treat", flavor: tool, at: performance.now() }; return; }
  if (tool === "wand") return;
  if (tool === "carry") { if (world.pickUp()) { drag = { kind: "carry" }; emote("!"); } return; }
  const toy = world.toys.find(item => item.kind !== "wand" && near(item, p, 10));
  if (toy) { world.grabToy(toy.id); drag = { kind: "toy", id: toy.id }; return; }
  if (near(world.furniture.bowl, p, 2)) { world.fillBowl(); sound.rattle(); diary("you filled the bowl", "fill"); return; }
  if (near(world.furniture.water, p, 2)) { world.fillWater(); sound.lap(); diary("you filled the water", "water"); return; }
  if (world.handOver()) { drag = { kind: "pet" }; world.setPetting(true); }
});

canvas.addEventListener("pointermove", event => {
  const p = toRoom(event);
  pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
  pointer.trail.push({ ...p, t: performance.now() });
  if (pointer.trail.length > 6) pointer.trail.shift();
  if (!ready) return;
  world.moveHand(p.x, p.y, true);
  if (drag && drag.kind === "furniture") { world.moveFurniture(drag.name, p.x, p.y); page.moved = drag.name; }
  if (drag && drag.kind === "pet") world.setPetting(world.handOver());
});

function release() {
  if (!pointer.down) return;
  pointer.down = false;
  const trail = pointer.trail, a = trail[0], b = trail[trail.length - 1];
  const dt = a && b ? Math.max(0.016, (b.t - a.t) / 1000) : 1;
  if (drag && drag.kind === "toy") {
    world.releaseToy((b.x - a.x) / dt, (b.y - a.y) / dt);
    if (Math.hypot(b.x - a.x, b.y - a.y) / dt > 200) diary("you threw a toy", "throw");
    else { const toy = world.toy(drag.id); if (toy && toy.kind === "mouse") world.windMouse(toy.id); }
  }
  if (drag && drag.kind === "carry") world.putDown();
  if (drag && drag.kind === "treat" && world.hand.holding) { world.holdNothing(); world.dropTreat(pointer.x, pointer.y, drag.flavor); }
  if (drag && drag.kind === "pet") world.setPetting(false);
  if (drag && drag.kind === "furniture" && drag.name === "bowl") page.bowlMovedAt = world.t;
  drag = null;
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("pointerleave", () => { if (!pointer.down) { pointer.inside = false; if (ready) world.moveHand(pointer.x, pointer.y, false); } });

// ------------------------------------------------------------------ what happened
function handleEvents() {
  const m = world.m;
  for (const event of world.events) {
    switch (event.type) {
      case "eat":
        if (event.taste === "bitter") { sound.yuck(); emote("✗", { color: "#b79c1c" }); diary("bit a lemon and hated it", "lemon", 1); done("lemon"); }
        else {
          sound.crunch();
          diary(event.what === "kibble" ? "ate from the bowl" : event.fromHand ? `took a ${event.what} from your hand` : `ate a ${event.what}`, `eat-${event.what}`);
          if (event.fromHand) { emote("♥"); done("handfed"); }
          if (event.what === "kibble" && page.bowlMovedAt !== undefined && world.t - page.bowlMovedAt > 2) done("moved");
        }
        break;
      case "drink": sound.lap(); diary("drank", "drink"); break;
      case "asleep": diary(event.onBed ? "fell asleep in bed" : "fell asleep on the floor", "asleep"); break;
      case "woke": diary(event.cause === "rose" ? "woke up" : `woke up (${event.cause})`, "woke"); break;
      case "call": sound.meow(); emote("♪", { color: "#7d5fa8" }); diary(m.needs.hunger > 0.6 ? "called: the bowl is empty" : "called for you", "call", 20); break;
      case "pounce": if (event.hit) { sound.pop(); done("played"); diary(`pounced on the ${event.toy}`, "pounce", 12); } break;
      case "caught": sound.pop(); emote("★", { color: "#e9a13b" }); diary(`caught the ${event.toy}`, "caught", 8); done("played"); break;
      case "kick": diary("chased the ball", "kick", 15); break;
      case "bump": emote("•", { color: "#8a6f66", size: 14 }); break;
      case "dawn": diary(`day ${event.day + 1} begins`, "dawn", 0); break;
      case "lifted": diary("was picked up", "lifted"); break;
      case "toy": if (event.kind !== "wand") diary(`a new ${event.kind} appeared`, "toy", 1); break;
      case "treat": diary(`you dropped a ${event.flavor}`, "treat", 2); break;
      default: break;
    }
  }
  world.events.length = 0;
  if (m.touch.stroke > 0.5 && !m.asleep) { if (Math.random() < 0.05) emote("♥", { dx: (Math.random() - 0.5) * 30, size: 16 }); done("pet"); }
  sound.purr(m.touch.stroke > 0.3 ? 0.07 : (m.asleep ? 0.012 : 0));
}

function mood() {
  const m = world.m, n = m.needs;
  if (m.asleep) return "asleep";
  if (m.held) return "held";
  if (m.touch.stroke > 0.4) return "happy";
  const [name, value] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  if (value > 0.6) return { hunger: "hungry", thirst: "thirsty", fatigue: "sleepy", boredom: "bored", lonely: "lonely" }[name];
  return arousal.level >= arousal.genes.threshold ? "alert" : "content";
}

const NEED_LABELS = { hunger: "Hunger", thirst: "Thirst", fatigue: "Sleepiness", boredom: "Boredom", lonely: "Loneliness" };
function renderNeeds() {
  const host = $("needs");
  if (!host.children.length) {
    for (const [key, label] of Object.entries(NEED_LABELS)) {
      const row = document.createElement("div"); row.className = "need"; row.id = `need-${key}`;
      row.innerHTML = `<span>${label}</span><div class="track"><i></i></div><b></b>`;
      host.append(row);
    }
  }
  for (const key of Object.keys(NEED_LABELS)) {
    const row = $(`need-${key}`), value = world.m.needs[key];
    row.querySelector("i").style.width = `${value * 100}%`;
    row.querySelector("b").textContent = value.toFixed(2);
  }
  $("clock").textContent = `day ${world.day + 1} · ${world.clock()}`;
  $("mood").textContent = mood();
}

// ------------------------------------------------------------------ saving
async function snapshot() {
  const saved = await brain.call({ op: "save" });
  return {
    version: VERSION, pack: page.pack, at: Date.now(), world: world.snapshot(), arousal: arousal.snapshot(),
    page: { name: page.name, words: page.words, todo: page.todo, diary: page.diary.slice(0, 30), decisions: page.decisions, routine: page.routine, lessons: page.lessons },
    brain: saved.bytes,
  };
}
async function save(announce) {
  if (!ready || saving) return;
  saving = true;
  try {
    await saveLife(await snapshot());
    savedAt = performance.now(); dirty = false;
    $("saved").textContent = `saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (announce) toast("saved in this browser");
  } catch (error) { console.error(error); $("saved").textContent = "not saved"; if (announce) toast("saving failed"); }
  saving = false;
}
// Saving is automatic: soon after anything was learned, at a calm moment, and at the latest
// every three minutes; also whenever the tab is hidden or closed.
function autosave(now) {
  if (!ready || saving || ticks < 20) return;
  const since = now - savedAt;
  const calm = calmNow && !pointer.down && show === null;
  if ((dirty && calm && since > 8000) || (calm && since > 60000) || since > 180000) save(false);
}
function restore(saved) {
  world = World.restore(saved.world);
  arousal = Arousal.restore(saved.arousal);
  Object.assign(page, saved.page);
  $("name").value = page.name; document.title = page.name;
  page.words.forEach((word, i) => { const input = document.querySelector(`#word${i} input`); if (input) input.value = word.label; });
  $("autoCare").checked = world.autoCare;
  renderWords(); renderTodo();
  steps = TICK_STEPS; wandId = null; quiet = null;
  savedAt = performance.now();
  $("saved").textContent = `saved ${new Date(saved.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
async function adopt(saved) {
  if (saved.version !== VERSION) throw new Error("this life was saved by another version");
  if (saved.pack !== page.pack) {             // another brain pack: keep it and restart on that pack
    await saveLife(saved);
    const url = new URL(location.href); url.searchParams.delete("pack");
    location.href = url.href;
    return;
  }
  ready = false;
  while (inFlight) await new Promise(resolve => setTimeout(resolve, 30));
  await brain.call({ op: "load", bytes: saved.brain.slice(0) });
  restore(saved);
  ready = true;
  toast(`${page.name} is home`);
}

// ------------------------------------------------------------------ the loop
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  view.time += real;
  view.blink = (view.time % 4.2) < 0.12;
  if (ready && !paused) {
    const speed = page.speed * (page.skipNight && world.m.asleep ? 4 : 1);
    bank = Math.min(bank + real * speed, 0.4);
    let guard = 0;
    // On a machine where a decision takes longer than the 0.15 s between decisions, Mochi
    // decides every second interval and holds its action in between, so the room keeps its pace.
    if (latency > 135) stride = 2; else if (latency < 85) stride = 1;
    while (bank >= DT && guard++ < 80) {
      if (steps >= TICK_STEPS * stride) {
        if (inFlight) break;                    // the brain is still settling: the world waits
        steps = 0;
        decide();
      }
      world.step(); steps += 1; bank -= DT;
    }
    handleEvents();
    if (wandId !== null && !world.toy(wandId)) wandId = null;
    autosave(now);
  }
  const m = world.m, hand = world.hand;
  const target = hand.present ? hand : { x: m.x + Math.cos(m.heading) * 60, y: m.y + Math.sin(m.heading) * 60 };
  const d = Math.max(1, Math.hypot(target.x - m.x, target.y - m.y));
  view.look = [(target.x - m.x) / d, (target.y - m.y) / d];
  drawRoom(ctx, world, view);
  if (frames++ % 12 === 0) renderNeeds();
  brainView.frame(now);
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => { if (document.hidden && ticks > 20) save(false); });
window.addEventListener("pagehide", () => { if (ticks > 20) save(false); });
window.mochi = { get world() { return world; }, get page() { return page; }, get arousal() { return arousal; }, get ticks() { return ticks; }, get latency() { return latency; }, brainView, version: VERSION, BODY, ACTIONS };

boot();
requestAnimationFrame(frame);
