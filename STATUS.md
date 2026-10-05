# Status

Measured on 2026-10-05 with `cadence-net` 0.74.0. Headless runs use the page's own world
(`web/js/`) in Node and the page's own brain host (`mochi/`) as a native process. Sweeps and
bootstraps ran on one AWS c7i.16xlarge; page and Pyodide timings on an Apple M4 that other
jobs were loading at the time. Uniform random over the 17 actions is the baseline for every
behaviour count, and the scripted mother is the upper reference.

## The packaged brain

Pack `mochi-0.74.0-a`: `Brain.compose(223, 17, modules=(512,))`, 1,264 neurons, 393,728
synapses, trace amplitude 0.3, motor temperature 0.1, teacher rate 0.5. Raised by 32 pups
over 4,000 guided ticks and 16,000 weaning ticks. During weaning the mother takes turns: for
150 ticks she holds back and the pups live on their own answers, for the next 150 she corrects
every disagreement. Of the 640,000 pup moments 98,449 were lessons. Agreement of a pup's own
free answer with the mother, scored before any lesson on that moment:

| Ticks | All | Rest | Walk, exact direction | Eat or drink | Sleep | Pounce | Call | Tricks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Guided, the last 2,000 | 0.88 | 0.99 | 0.64 | 0.89 | 1.00 | 0.39 | 0.00 | 0.93 |
| Weaning, the last 2,000 | 0.75 | 0.96 | 0.42 | 0.71 | 1.00 | 0.35 | 0.08 | 0.79 |

Agreement is lower in weaning because the pups steer their own bodies into moments the mother
would not have reached. Reward per tick is 0.0074 while she moves the bodies and 0.0064 while
the pups move their own.

### Three days on its own

One creature, three days, five seeds, the virtual owner present, no mother.

| | Portions a day | Drinks a day | Night asleep | Night asleep in bed | Play hits a day | Reward a day | Decisions from routine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mother (teacher) | 3.4 | 3.0 | 0.95 | 0.95 | 11.6 | 16.4 | |
| Brain, living and learning | 5.1 | 6.5 | 0.97 | 0.78 | 34.3 | 13.6 | 0.89 |
| Brain, frozen (greedy, never learning) | 3.9 | 5.0 | 0.83 | 0.71 | 38.3 | 14.2 | 1.00 |
| Uniform random | 0.6 | 0.8 | 0.00 | 0.00 | 1.2 | -9.3 | |

The brain keeps the whole day on its own. Living with learning on it earns 13.6 reward a day
against the mother's 16.4 and the random walker's -9.3, and each of the five seeds lies
between 12.4 and 14.5. It eats and drinks more often than the mother at a lower mean hunger
(0.28 against 0.33) and pounces three times as often. It is asleep for 97% of the night: 78%
in the bed and the rest where it lay down. The frozen brain sleeps through less of the night
(0.83; two of the five seeds 0.62 and 0.66), and living with learning on closes that gap.
Settles take 30 sweeps on a routine decision and 32 on an aroused one, and none was refused.

### Teaching a word

Scenario `teach`: say a word, show a move for six ticks, praise; then say the word alone and
take the first trick within 1.5 s as the answer. Ten lessons per word, words taught in turn.

| Arm | Right answers in the last four lessons | First lesson with every word right | Unprompted tricks per quiet tick, last four lessons |
| --- | ---: | ---: | ---: |
| Two words, lesson with its contrast half | 7 of 8 | 3 | 0.24 |
| The same, and "No!" on an unprompted trick | 8 of 8 | 3 | 0.19 |
| The same, with a pattern-separated outcome store | 8 of 8 | 5 | 0.00 |
| No contrast half (control) | 8 of 8 | 4 | 0.97 |
| Four words, with the contrast half | 12 of 16 | 8 | 0.13 |

Private imagination before any lesson gives the taught move a probability of 0.00 with or
without the word. After ten lessons it reads 0.96 for "sit" with its word and 0.26 in silence,
and 0.99 against 0.26 for "spin". Without the contrast half the brain learns the moves as fast
and then offers them in silence on 97% of quiet ticks: the move attached to the room. With the
contrast half the unprompted tricks come in bursts (one of the last four lessons at 0.96, two
at 0.00). With four words every word is answered right at lesson 8. Each arm is one run.

### What is work in progress

- **A treat held out.** Scenario `treat`: a treat is held out for eight seconds, ten offers.
  The mother takes a cookie every time and never a lemon. The packaged brain takes a cookie
  held 90 units away 9 times of 10 when hungry (hunger 0.7, within 8 ticks), 6 of 10 at hunger
  0.4 and 3 of 10 at hunger 0.2. At hunger 0.4 it takes a fish 1 time of 10, a lemon 2 of 10,
  and a cookie held 250 units away 1 of 10. In its ordinary days it eats 8.5 treats a day (the
  mother 6.1).
- **A bad bite.** Offered a lemon and a cookie in turn (hunger 0.4, sixteen offers), the brain
  takes 3 lemons and at most 1 cookie, with or without emphasis on the bad taste. A bad bite
  lowers the will to eat from the hand for both treats; an aversion to the lemon alone is
  work in progress.
- **A moved bowl.** The bowl stands in one place for the whole bootstrap, so the way to it is
  learned from the sense of place. After the bowl moves to the far wall Mochi eats nothing in
  four periods of 600 ticks, against two meals in the 1,200 ticks before the move, and its
  hunger ends at 1.0.
- **Unprompted tricks after lessons.** A freshly taught move is sometimes offered in silence
  (see the table above).

## How the brain was chosen

### Teaching on every tick collapses onto the commonest actions

Sixteen pups, lessons on every guided tick (the first pilots, trace amplitude 1.0).

| Layout | Ticks | Rest | Walk | Eat | Sleep |
| --- | ---: | ---: | ---: | ---: | ---: |
| `compose` (384, 256) | 1,750 | 0.93 | 0.10 | 0.00 | 0.97 |
| Modality areas around a hub | 1,000 | 0.89 | 0.07 | 0.00 | 0.77 |

Lessons only on a witnessed disagreement (the brain's own answer gives the mother's action a
probability below 0.5) end the collapse and are the rule in everything below.

### What a backprop learner gets from the same information

A one-hidden-layer network (256 units, Adam) trained on 205,000 shuffled moments for six
epochs predicts the mother at 0.90: walking 0.67 exact and 0.85 within one direction, eating
0.96, pouncing 0.58, calling 0.47. The call rhythm and direction ties are not in the senses.
Walking is a conjunction of the urgent need and the bearing of what relieves it.

### One region with a weak trace matches the online baselines

4,000 guided ticks of 32 recorded streams, agreement over the last 500 ticks. "Balanced" is the
mean over the seven action groups.

| Arm | Balanced | Walk | Eat | Pounce | Tricks | Sweeps per settle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Backprop, 512 hidden units, Adam, online | 0.72 | 0.58 | 0.85 | 0.29 | 0.93 | |
| `compose` 512, temperature 0.1 | 0.66 | 0.57 | 0.81 | 0.23 | 0.88 | 50 |
| `compose` 512, teacher rate 0.5 | 0.65 | 0.57 | 0.89 | 0.17 | 0.92 | 90 |
| `compose` 512, trace 0.3 | 0.62 | 0.55 | 0.86 | 0.24 | 0.69 | 105 |
| Backprop, linear, online | 0.61 | 0.48 | 0.79 | 0.17 | 0.80 | |
| `compose` 512 (trace 0, rate 0.1, temperature 0.2) | 0.60 | 0.52 | 0.87 | 0.11 | 0.73 | 127 |
| `compose` 256 | 0.61 | 0.53 | 0.87 | 0.14 | 0.74 | 123 |
| `compose` 768 | 0.61 | 0.52 | 0.88 | 0.14 | 0.72 | 124 |
| `compose` 1024 | 0.60 | 0.51 | 0.85 | 0.10 | 0.74 | 140 |
| `compose` (384, 256) | 0.58 | 0.52 | 0.81 | 0.07 | 0.72 | 161 |
| `compose` 512, lesson on every tick | 0.54 | 0.38 | 0.81 | 0.07 | 0.53 | 98 |
| `compose` 512, temperature 0.3 | 0.47 | 0.45 | 0.81 | 0.02 | 0.01 | 143 |
| `compose` 512, trace 1.0 | 0.40 | 0.27 | 0.14 | 0.12 | 0.34 | 32 |
| `compose` 512, motor lateral -0.1 | 0.28 | 0.00 | 0.00 | 0.00 | 0.00 | 179 |

The working trace at amplitude 1.0 blocks acquisition; 0.1 and 0.3 do not. Width from 256 to
1,024 and a second region change nothing at this amount of experience. A sharper motor
temperature and a larger teacher rate help and shorten the settles. The outcome store, with a
raw or a pattern-separated key, changes nothing during the bootstrap (0.60 without it).

### The richer layouts

| Layout | Experience | Walk | Eat | Sweeps per settle | Pyodide, one routine decision |
| --- | --- | ---: | ---: | ---: | ---: |
| Modality areas, trace 1.0 | 19,000 lessons | 0.00 | 0.01 | 32 | |
| Modality areas and a dentate of 1,024 cells, trace 1.0 | 19,000 lessons | 0.07 | 0.20 | 32 | |
| The same, trace 0 | 19,000 lessons | 0.30 | 0.72 | 201 | 314 ms |
| `compose` 512, trace 0 | 48,000 lessons | 0.40 | 0.78 | 81 | 89 ms |

The dentate region learns inside the settlement where the modality layout alone does not, and
it settles slowly: eleven populations and about 200 sweeps a decision. The one-region brain
reaches the same counts at a third of the time per decision. The dentate stays in
`mochi/anatomy.py` as a gene with zero cells as its control.

An idealised form of the same idea, a fixed sparse expansion read by a delta rule outside the
brain, predicts the mother at 0.89 on walking within one direction after 16,000 moments. That
is a memory lookup and is not Mochi's answer path.

### Weaning in turns

Agreement while the mother corrects says little about the brain alone. Corrected on every
tick, the pups never live with their own mistakes, and the frozen brain then loses parts of
its day. One brain layout and one set of genes throughout except where a column says
otherwise; three days alone, frozen.

| Guided + weaning ticks | Turns alone / corrected | Trace | Teacher rate | Portions a day | Drinks a day | Night asleep | Reward a day |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4,000 + 4,000 | corrected throughout | 0.3 | 0.5 | 0.2 | 0.0 | 0.96 | -7.4 |
| 4,000 + 4,000 | corrected throughout | 0.1 | 0.5 | 1.3 | 5.1 | 0.65 | 4.3 |
| 4,000 + 4,000 | corrected throughout | 0.3 | 0.3 | 6.0 | 0.4 | 0.99 | -0.4 |
| 4,000 + 4,000, 768 neurons | corrected throughout | 0.3 | 0.5 | 0.9 | 1.3 | 0.81 | -3.0 |
| 4,000 + 8,000 | corrected throughout | 0.3 | 0.5 | 4.9 | 2.8 | 0.92 | 5.6 |
| 4,000 + 16,000 | corrected throughout | 0.3 | 0.5 | 3.7 | 0.1 | 0.89 | -1.0 |
| 4,000 + 16,000 (packaged) | 150 / 150 | 0.3 | 0.5 | 3.9 | 5.0 | 0.83 | 14.2 |
| 4,000 + 16,000 | 300 / 100 | 0.3 | 0.5 | 5.4 | 4.1 | 0.97 | 11.5 |
| 4,000 + 16,000 | 150 / 150 | 0.1 | 0.5 | 4.3 | 3.1 | 0.96 | 12.9 |
| 4,000 + 16,000 | 150 / 150 | 0.3 | 0.3 | 4.7 | 2.5 | 0.96 | 12.9 |
| 4,000 + 16,000 | 150 / 150 | 0 | 0.5 | 3.3 | 2.3 | 0.97 | 10.3 |

The four rows with 4,000 weaning ticks are three seeds each; all other rows are five seeds.
Corrected throughout, every brain drops a part of the day: the one with 16,000 weaning
ticks never drinks. Every brain weaned in turns keeps eating, drinking, sleeping and playing.
Living with learning on, the packaged brain earns 13.6 a day and the 300 / 100 brain 9.1, so
the 150 / 150 brain is the packaged one.

### The live loop

The first live loop aroused Mochi on any reward that differed from its running mean and on any
need above 0.8, and paid for eating and drinking at any level of need.

| Live loop | Decisions from routine | Portions a day | Drinks a day | Night asleep in bed | Reward a day |
| --- | ---: | ---: | ---: | ---: | ---: |
| First (an earlier brain, 4,000 weaning ticks) | 0.01 | 5.7 | 13.5 | 0.15 | 6.7 |
| Current (the packaged brain) | 0.89 | 5.1 | 6.5 | 0.78 | 13.6 |

Under the first loop the creature was aroused on 99% of its decisions, sampled its actions and
learned to sip water it did not need at the cost of its night. The current loop pays nothing
to the sated, arouses on outcomes that stand out (above 0.15), pain, company and novelty, and
records what aroused Mochi for the action it took.

## The page

`tools/check_page.py` on the served page in headless Chromium, default pack `mochi-0.74.0-a`:
twelve clauses pass (the brain starts, the pack is named and raised, decisions flow, the brain
view draws settling steps, the bowl fills, a word is heard, showing is a lesson, praise lands,
the life saves, a reload wakes the same pet, no JavaScript error). The same check passes on
`dist/mochi/` served as plain files, and the Vite project in `dist/lovable/` builds and shows
the app in its iframe.

The engine under Pyodide 314.0.7 in Node, `Brain.compose` at the library's default trace:

| Neurons | Synapses | Routine decision | Aroused step | Lesson |
| ---: | ---: | ---: | ---: | ---: |
| 590 | 63,232 | 2 ms | 6 ms | 9 ms |
| 846 | 167,424 | 4 ms | 12 ms | 20 ms |
| 1,358 | 498,688 | 10 ms | 37 ms | 60 ms |
| 2,382 | 1,652,736 | 39 ms | 166 ms | 240 ms |

On the loaded M4 the page measured 50 to 140 ms per decision with the packaged brain. Above
135 ms the page decides every second interval and holds the action in between; the brain view
records settling steps on fewer decisions as latency rises.

## Checks

| Check | Result |
| --- | --- |
| `npm test` (room, senses, mother, arousal) | 11 pass |
| `pytest tests` (the brain host's contracts) | 12 pass |
| `tools/check_page.py --expect-raised` | 12 clauses pass |
