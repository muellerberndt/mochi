# Working on Mochi

**Fixed Cadence foundation.** Read the [manifesto](https://github.com/muellerberndt/cadence/blob/main/AGENTS.md#goal-and-mechanism)
of the library before changing a mechanism. Start from the simplest existing System 1 brain.
Every addition stays within local agreement repair between patches into the same coupled global
equilibrium, answers a measured failure of the simpler brain and keeps the simpler setting as
its control. Mochi's brain is `Brain.compose` with one wide processing region; the modality
layout and the dentate region in `mochi/anatomy.py` are measured candidates, and their numbers
are in [STATUS.md](STATUS.md).

**One brain, one settlement.** Senses, association region, working trace and motor cortex are
one connectome inside one `cadence.Brain`. Every decision settles the whole connectome and
`act` checks the complete residual. The associative store is memory: its read is a drive into
the motor cortex that settles with everything else. It is never the answer path, and nothing
outside the brain supplies an action except a declared demonstration that moves the body.

**The world supplies problems, never answers.** `web/js/world.js` holds the room, the body
and one reward channel for relief and suffering. No sense carries an object's identity, a goal,
the mother's action or a lesson's answer. The mother (`web/js/mother.js`) is disclosed,
privileged structure for the bootstrap only; the page never consults her.

**Feedback belongs to the action the body executed.** A calm tick is a greedy read and learns
nothing. An aroused tick learns from the brain's own preceding action. A guided tick teaches
the shown action for the present moment and credits no reward to the brain's own choice. A
refused settle holds the body still and is counted; an outcome with no decision to own it is
counted as dropped. `tests/test_brain.py` pins these contracts.

**Measure behaviour.** Every claim is a count against uniform random and the mother:
portions eaten, drinks taken, the share of the night asleep in bed, pounces that hit, answers
to a taught word and unprompted tricks in silence. Score the brain's own free answer before
any lesson on that moment. Failed arms and their numbers stay in STATUS.md.

**Brains are packs.** A raised brain ships as a folder under `web/brains/` with its Cadence
wheel, its host sources, its life file and a manifest (`tools/pack.py`). A saved pet keeps the
pack it was born from. A new Cadence release becomes a new pack; never edit a published pack
in place.

**Where things are.** `web/` is the page and the world (plain ES modules, no build step);
`mochi/` the Python brain host that runs in Pyodide on the page and natively in the harness;
`sim/` the headless harness (bootstrap, assays, scenarios); `tools/` the sweep, the pack and
bundle builders and the page check; `tests/` the checks; `runs/` and `dist/` are local only.
