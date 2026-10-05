// What Mochi can sense and do. The page, the headless harness and the Python brain host all
// read this one declaration; mochi/spec.json is its export and a test keeps the two equal.

// The motor cortex: one neuron per action, one choice per decision.
export const ACTIONS = [
  "rest",
  "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest",
  "eat", "sleep", "pounce", "call",
  "sit", "spin", "jump", "paw",
];
export const A = Object.fromEntries(ACTIONS.map((name, index) => [name, index]));
export const MOVES = 8;          // actions 1..8, clockwise from north
export const TRICKS = ["sit", "spin", "jump", "paw"];

// The sensory sheet, in the order the brain receives it. `area` names the cortical area a
// sense projects to in the modality layout; the control layout feeds every sense to one region.
export const SENSES = [
  { name: "vision.hue", size: 96, area: "sight" },     // 6 hues x 8 bearings x 2 ranges
  { name: "vision.motion", size: 8, area: "sight" },   // bearing of anything that moves
  { name: "vision.hand", size: 17, area: "sight" },    // the hand: 8 bearings x 2 ranges, touching
  { name: "smell", size: 11, area: "smell" },       // food odour: 8 bearings, then savoury, sweet, bitter
  { name: "mouth", size: 4, area: "smell" },        // food at mouth, water at mouth, good taste, bad taste
  { name: "hearing", size: 32, area: "hearing" },      // a small cochlea: six cells per sound
  { name: "touch", size: 10, area: "touch" },         // stroke, boop, held, four walls, toy, soft bed, warm sun
  { name: "proprio", size: 4, area: "touch" },        // moving, sitting, lying, eyes closed
  { name: "needs", size: 15, area: "insula" },         // five needs x three levels
  { name: "light", size: 2, area: "insula" },          // day, night
  { name: "place", size: 24, area: "place" },           // 6 x 4 place cells
];
export const INPUTS = SENSES.reduce((sum, sense) => sum + sense.size, 0);
export const OFFSETS = (() => {
  const out = {};
  let at = 0;
  for (const sense of SENSES) { out[sense.name] = at; at += sense.size; }
  return out;
})();

export const HUES = [0, 35, 60, 130, 215, 285];        // red, orange, yellow, green, blue, purple
export const HUE_NAMES = ["red", "orange", "yellow", "green", "blue", "purple"];
export const HUE_WIDTH = 50;                            // degrees to zero response
export const BEARINGS = 8;
export const NEEDS = ["hunger", "thirst", "fatigue", "boredom", "lonely"];
export const NEED_LEVELS = [0.25, 0.55, 0.85];
export const PLACE_GRID = [6, 4];

// Cochlear cells of each sound, six of the thirty-two. The four words are disjoint; the other
// sounds share at most two cells with any other sound. A word means nothing until a life gives
// it a meaning.
export const HEARING = 32;
export const SOUNDS = {
  word1: [0, 1, 2, 3, 4, 5],
  word2: [6, 7, 8, 9, 10, 11],
  word3: [12, 13, 14, 15, 16, 17],
  word4: [18, 19, 20, 21, 22, 23],
  whistle: [24, 25, 26, 27, 28, 29],
  clap: [30, 31, 0, 6, 12, 18],
  squeak: [30, 24, 1, 7, 13, 19],
  meow: [31, 25, 2, 8, 14, 20],
  rattle: [26, 27, 3, 9, 15, 21],
};
export const WORDS = ["word1", "word2", "word3", "word4"];

export const SPEC = {
  schema: "mochi-spec/1",
  actions: ACTIONS,
  senses: SENSES,
  inputs: INPUTS,
  sounds: SOUNDS,
};
