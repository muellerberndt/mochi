# Mochi: one continuing brain in a small room

Mochi is a creature with a body, five needs and one Cadence brain that lives through every
moment of its life. This document states the design and names every supplied choice.
[STATUS.md](STATUS.md) holds the measurements.

## The day

Mochi's routine is the business of keeping five needs in balance. Hunger, thirst, sleepiness,
boredom and loneliness each rise on their own clock, and each has something in the room that
relieves it: the bowl, the water dish, the bed, the toys, the hand. Light runs through a day
of 360 seconds with a night at its end. A patch of sun crosses the floor.

Out of that comes a day: wake at first light, eat, drink, play, rest in the sun, come to the
hand, eat again, go to bed at dusk. Nothing in Mochi follows a clock. When every need is met
it rests, and that rest is the equilibrium the rest of the design is built around. An empty
bowl, a new toy, a word or a moved bed disturbs it.

## Body and senses

The room is 960 by 600 units. The body moves in eight directions or does one of nine other
things: rest, eat or drink what is at its mouth, lie down, pounce, call, sit, spin, jump, paw.
One action is chosen every 0.15 seconds.

The senses are 223 population-coded values between 0 and 1.

| Sense | Cells | What it carries |
| --- | ---: | --- |
| Sight, colour | 96 | Six hues by eight bearings by two ranges. Sight ends at 420 units. |
| Sight, motion | 8 | Bearing of anything that moves. |
| Sight, the hand | 17 | Bearing and range of the hand, and whether it touches. |
| Smell | 11 | Bearing of food odour, and whether it is savoury, sweet or bitter. |
| Mouth | 4 | Food at the mouth, water at the mouth, a good taste, a bad taste. |
| Hearing | 32 | A small cochlea: six cells per sound. |
| Touch | 10 | Stroke, boop, being held, four walls, a toy, the soft bed, the warm sun. |
| Body | 4 | Moving, sitting, lying, eyes closed. |
| Needs | 15 | Five needs at three levels. |
| Light | 2 | Day, night. |
| Place | 24 | A six by four grid of place cells. |

No sense names an object, a goal, the mother's action or a lesson's answer. The bowl is an
orange thing at a bearing; a word is six cochlear cells that mean nothing until a life gives
them a meaning. Because sight ends at about half the room, the way to an unseen bowl has to
come from the sense of place and what the brain has learned about the room.

One reward channel carries relief and suffering. Eating when hungry, drinking when thirsty,
sleeping when tired, a pounce when bored and a stroke when lonely pay in proportion to the
need they relieve. Food and water pay nothing to the sated. A wall, a lemon, a clap and a
"No!" cost. Praise pays.

## The brain

Mochi's brain is the existing System 1 of the Cadence library at Mochi's size:

```python
Brain.compose(inputs=223, actions=17, modules=(512,))
```

The 223 sensory neurons project to one association region of 512 neurons. The association
region and the 17 motor neurons exchange signals through reciprocal synapses. A working trace
of the association region returns through 512 prefrontal neurons. That is 1,264 neurons and
393,728 synapses in one connectome. Every decision settles all of it together, checks the
full residual, and reads the action from the settled motor cortex. A settle that does not
qualify issues no action; the body holds still and the refusal is counted.

Three things changed from the library's defaults, each measured against the default as its
control:

- **The working trace is weak during acquisition** (amplitude 0.3, decay 0.8; library 3.0 and
  0.2). At amplitude 1.0 the association region holds on to its own past and the routine is
  not acquired.
- **The motor temperature is 0.1** (library 0.2). The policy is sharper, lessons stop sooner
  and settles are shorter.
- **A lesson is given only on a witnessed disagreement.** Taught on every tick, the brain
  collapses onto the two commonest actions.

Two richer layouts are declared in `mochi/anatomy.py` and were measured: a cortical area per
sense around one association hub, and that layout with a dentate region of sparse conjunction
cells. Neither earned its cost here; the numbers are in STATUS.md and both stay available as
genes.

## Routine and arousal

The body computes an arousal level from what just happened: an outcome that stands out, pain,
company or something new in view. It fades by a tenth each decision.

- **Calm.** The brain answers from a greedy settle. Nothing is learned and nothing is written.
- **Aroused.** The brain samples its action, learns from the outcome of its own preceding
  action through eligibility traces and the dopamine signal of its critic, and writes that
  outcome to its associative store.
- **Shown.** While a guide moves the body (the mother during the bootstrap, the player's Show
  buttons in the game), the brain's own answer is read first and the shown action is taught
  for that very moment through the library's teacher contrast. Reward learning credits nothing
  of the brain's own, because it did not act.

A meal, a drink and a night's sleep are routine and leave Mochi calm. Feedback always belongs
to the action the body executed. When something wakes a calm Mochi, the outcome is written to
the store for the action it had just taken from routine: what wakes it is remembered.

## Teaching a word

A lesson that shows a move while a word rings has two halves, taught in one step. The first
is the present moment with the shown move. The second is the last quiet moment Mochi really
lived, with the everyday action it answered then. The two moments share the room, the hour
and the needs, and differ in the word. So the lesson attaches the move to the word and leaves
the quiet room answering as before. Without the second half, one lesson makes Mochi offer the
move everywhere.

The second half is rehearsal of a witnessed moment and is counted as a lesson. A quiet moment
that Mochi answered with a trick is never used, so a trick it is offering unprompted is never
rehearsed.

## Memory

| Reach | Where it lives | What writes it |
| --- | --- | --- |
| Seconds | The working trace of the association region. | Every decision. |
| Today | The fading residual of the associative store. | The outcome of an aroused action, at full rate; it fades as later outcomes arrive. |
| Lasting | The persistent synapses of the store, and the synapses of the cortex. | Repetition and emphasis for the store; lessons and reward for the cortex. |

The associative store is the library's `SynapticMemory` between the senses and the motor
cortex. Its read is a drive into the motor cortex that settles with everything else; the
action is still the settled state. Emphasis decides how fast an outcome becomes lasting:
praise, a "No!" and a bad taste consolidate faster than an ordinary moment.

**A night.** Once Mochi has slept for six seconds, half of what the store holds fresh becomes
lasting and the rest fades (`sleep_transfer`, control 0). What was learned once today is
weaker tomorrow; what was practised stays.

The store of a newborn is empty. During the bootstrap nothing is written to it, so what it
holds is what this one life brought.

## The bootstrap

A scripted mother knows the room and shows a litter of 32 pups how a day goes. She decides
from what a pup can sense wherever she can. She is privileged, disclosed structure, and the
page never consults her.

1. **Guided.** She moves every body. Where a pup's own answer gives her action a probability
   below one half, her action is the lesson for what that pup senses.
2. **Weaning.** The pups move their own bodies and the mother takes turns. For 150 ticks she
   holds back and a pup lives with its own answers and their consequences; for the next 150
   she corrects every disagreement. A pup corrected on every tick never meets its own
   mistakes, and the brain it grows into loses parts of the day when it is alone.

A virtual owner visits, strokes, feeds, throws the ball, waves the feather, forgets the bowl
now and then and makes meaningless noises, so the pups meet what a player will do. Words are
never given a meaning during the bootstrap.

## Brain packs

A raised brain is a folder: the Cadence wheel, the Python host of that day, the life file, the
atlas for the brain view, and a manifest with the senses and actions it was raised for. The
page starts new pets from the default pack and keeps each saved pet on the pack it was born
from. The worker loads whatever Pyodide and Cadence release the pack names.

## Supplied choices

Everything below is designed and disclosed. Each is a gene with the stated founder value; the
value named as control is the simpler setting it was measured against.

| Choice | Founder | Control |
| --- | --- | --- |
| Association width | 512 | 256 |
| Working trace amplitude, decay | 0.3, 0.8 | 3.0, 0.2 (library); 0 |
| Motor temperature | 0.1 | 0.2 (library) |
| Teacher rate, momentum | 0.5, 0 | 0.5, 0.9 (library) |
| Teaching margin | 0.5 | above 1: teach every tick |
| Reward rates (actor, bias, critic) | 0.1, 0.01, 0.3 | 1.0, 0.05, 0.3 (library) |
| Discount, eligibility decay | 0.9, 0.8 | library |
| Store key | the raw observation | a pattern-separated code |
| Sleep transfer | 0.5 | 0 |
| Arousal decay, threshold, outcome floor | 0.9, 0.2, 0.15 | every tick aroused |
| Arousal from an unmet need | off | on above a need of 0.8 |
| Weaning turns, alone and corrected | 150, 150 ticks | corrected throughout |
| Contrast half of a lesson | the last quiet everyday moment | none |
| Emphasis of praise, "No!", a bad taste, a treat | 4, 4, 4, 1 | 0 |
| Sight range, near band | 420, 150 | the whole room |

The mother, the virtual owner, the reward channel, the arousal rule and the body's habituation
to objects are supplied machinery of the body and the world. Mochi's drawn face, its poses and
its sounds follow the action the brain chose and the needs the body measured; none of them
decides anything.
