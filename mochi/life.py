"""A continuing life: one brain and the ticks it lives through.

Every tick the body reports what it senses and what its last action brought. The brain answers
in one of three ways, and the body says which applies:

* **routine** (calm): the brain answers from a greedy settle. Nothing is learned and no memory
  is written. A pending outcome of an earlier aroused action is closed once, then the chain ends.
  If the outcome of a calm action is what arouses Mochi (praise after a routine answer, a bad
  taste), that outcome is recorded in the associative store for the action that was executed:
  what wakes it is what it remembers.
* **aroused** (surprise, pain, an unmet need, company, youth): the brain learns from the outcome
  of its own preceding action through its eligibility traces, writes the associative store,
  and samples its next action.
* **guided** (a demonstration is present): the brain's own free answer is read first. Where it
  disagrees with the demonstration, the demonstrated action teaches the cortex for this very
  observation; where it agrees, nothing is taught. Reward learning credits nothing here, since
  a greedy read carries no eligibility; the outcome of the executed action is recorded in the
  associative store, which stores what the executed action brought.

Feedback always belongs to the action the body executed. A refused settle holds the body still
and is counted; an outcome that finds no decision is counted as dropped.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from cadence import Brain, SynapticMemory

from . import anatomy, stores
from .anatomy import Genes, build, describe

__all__ = ["Life"]

_COUNTERS = (
    "ticks", "routine", "aroused", "guided", "refused", "dropped", "lessons",
    "sweeps_routine", "sweeps_aroused", "sweeps_guided", "agree", "scored",
)


class Life:
    def __init__(self, spec: dict[str, Any], genes: Genes | None = None, seed: int = 0,
                 brain: Brain | None = None) -> None:
        self.spec = spec
        self.genes = genes or Genes()
        self.seed = int(seed)
        self.brain = brain if brain is not None else build(spec, self.genes, self.seed)
        self.actions = len(spec["actions"])
        self.counters = dict.fromkeys(_COUNTERS, 0)
        # the last executed action that carries no reward credit of the brain's own, awaiting its outcome
        self._guided: tuple[np.ndarray, np.ndarray] | None = None
        self._guided_shown = False
        self._carry: np.ndarray | None = None   # reward of a refused update, owed to the same action
        self.rng = np.random.default_rng([self.seed, 0x30C1])
        self._streams = 0

    # ---------------------------------------------------------------- one tick
    def tick(self, observations: Any, rewards: Any = None, *, aroused: bool = True,
             guide: Any = None, teacher: Any = None, salience: Any = None,
             margin: float | None = None, independence: float = 0.0,
             contrast: dict[str, Any] | None = None, record: bool = True) -> dict[str, Any]:
        """Close the last action's outcome, then answer this moment.

        ``observations`` is ``(streams, inputs)``; ``rewards`` the reward each stream's body
        collected since its last decision. ``guide`` names the demonstrated action per stream
        for a guided tick. A demonstration becomes a lesson only where the brain's own answer
        gives the demonstrated action a probability below ``margin`` (a witnessed disagreement);
        ``margin`` above 1 teaches every tick. With ``independence`` a stream's body executes
        the brain's own answer instead of the demonstration with that probability, and the
        lesson still follows a disagreement. ``teacher`` labels the current observation on a
        free aroused tick. ``salience`` raises the consolidation of this outcome in the
        associative store.

        ``contrast`` gives a lesson its other half: an earlier moment the brain really lived
        (``obs``) and the answer it gave of its own then (``action``). Both moments are taught
        in one step, the shown action for now and the brain's own earlier answer for then, so
        the lesson attaches to what differs between the two (a word that just sounded) and
        leaves what they share (the room, the hour, the needs) answering as before. This is
        rehearsal of a witnessed moment; it is counted as a lesson.

        ``record`` false keeps a guided tick's outcome out of the associative store (the
        bootstrap: the store of a newborn is empty and fills from its own life).
        """
        brain = self.brain
        x = np.asarray(observations, dtype=float)
        if x.ndim != 2:
            raise ValueError("observations must be (streams, inputs)")
        batch = len(x)
        if self._streams and self._streams != batch:
            self.start_streams()
        self._streams = batch
        r = np.zeros(batch) if rewards is None else np.asarray(rewards, dtype=float).reshape(batch)
        r = np.clip(r, -1.0, 1.0)
        if self._carry is not None:
            r = np.clip(r + self._carry, -1.0, 1.0)
            self._carry = None
        importance = None if salience is None else np.asarray(salience, dtype=float).reshape(batch)
        still = np.zeros(batch, dtype=bool)
        pending = brain.basal_ganglia._pending is not None
        counters = self.counters
        counters["ticks"] += batch
        out: dict[str, Any] = {"refused": False, "lesson": None}

        if self._guided is not None:
            # the last action was executed without reward credit (shown, or a calm routine
            # answer): a shown action's outcome is always recorded, a routine action's only
            # when its outcome is what aroused the body
            if self._guided_shown or guide is not None or aroused:
                self._remember_guided(r, importance)
            else:
                self._guided = None
                counters["dropped"] += int(np.count_nonzero(np.abs(r) >= 0.15))
        elif not pending and np.any(r != 0.0):
            counters["dropped"] += int(np.count_nonzero(r))

        own = None
        try:
            if guide is not None:
                labels = np.asarray(guide, dtype=np.int64).reshape(batch)
                if pending:
                    brain.learn(r, still, x, salience=importance)
                drive = brain.stimulus(x)                 # the trace of the moments before
                own = brain.act(x, greedy=True)           # the brain's own answer, before the lesson
                rows = np.arange(batch)
                sure = self.policy()[rows, labels]
                limit = self.genes.teach_margin if margin is None else float(margin)
                teach = sure < limit
                if teach.any():
                    lesson_drive, lesson_labels = drive[teach], labels[teach]
                    if contrast is not None and batch == 1:
                        earlier = np.asarray(contrast["obs"], dtype=float).reshape(1, -1)
                        answer = np.asarray(contrast["action"], dtype=np.int64).reshape(1)
                        if answer[0] != labels[0]:
                            lesson_drive = np.vstack([lesson_drive, brain.stimulus(earlier)])
                            lesson_labels = np.concatenate([lesson_labels, answer])
                            counters["rehearsed"] = counters.get("rehearsed", 0) + 1
                    brain.learner.step(lesson_drive, lesson_labels)
                memory = brain.hippocampus
                if isinstance(memory, stores.Stores) and self.genes.shown_amplitude:
                    memory.show(x, labels, importance)
                action = labels.copy()
                if independence > 0.0:
                    alone = self.rng.random(batch) < independence
                    action[alone] = own[alone]
                self._guided = (x.copy(), action.copy()) if record else None
                self._guided_shown = True
                mode = "guided"
                taught = int(np.count_nonzero(teach))
                counters["lessons"] += taught
                counters["agree"] += int(np.count_nonzero(own == labels))
                counters["scored"] += batch
                out["lesson"] = {"taught": taught, "sure": [round(float(v), 4) for v in sure]}
            elif aroused:
                kwargs: dict[str, Any] = {}
                if pending:
                    kwargs.update(reward=r, done=still, salience=importance)
                if teacher is not None:
                    labels = np.asarray(teacher, dtype=np.int64).reshape(batch)
                    kwargs["teacher"] = labels
                    counters["lessons"] += batch
                action = brain.step(x, **kwargs)
                own, mode = action, "aroused"
            else:
                if pending:
                    brain.learn(r, still, x, salience=importance)
                action = brain.act(x, greedy=True)
                own, mode = action, "routine"
                if record:
                    self._guided = (x.copy(), np.asarray(action, dtype=np.int64).copy())
                    self._guided_shown = False
        except RuntimeError as error:
            # A settle that did not qualify: the body holds still. An update that was refused
            # keeps its pending action, and its reward stays owed to that action.
            if brain.basal_ganglia._pending is not None and pending:
                self._carry = r
            counters["refused"] += batch
            report = brain.last_settlement
            out.update(refused=True, error=str(error)[:200], mode="refused",
                       action=[-1] * batch, own=[-1] * batch,
                       sweeps=int(report["steps"]) if report else 0)
            return out

        report = brain.last_settlement
        sweeps = int(report["steps"]) if report else 0
        counters[mode] += batch
        counters["sweeps_" + mode] += sweeps * batch
        out.update(action=[int(a) for a in action], own=[int(a) for a in own], mode=mode, sweeps=sweeps)
        return out

    def _remember_guided(self, r: np.ndarray, importance: np.ndarray | None) -> None:
        """The outcome of a demonstrated action, recorded for the situation it was executed in."""
        assert self._guided is not None
        keys, labels = self._guided
        self._guided = None
        memory = self.brain.hippocampus
        if memory is None or len(keys) != len(r):
            return
        rows = np.arange(len(labels))
        target = np.zeros((len(labels), len(self.brain.motor_index)))
        target[rows, labels] = r
        observed = np.zeros(target.shape, dtype=bool)
        observed[rows, labels] = True
        salience = SynapticMemory.salience_vector(np.abs(r) if importance is None else importance, len(r))
        if isinstance(memory, SynapticMemory):
            memory.observe(keys, target, salience=salience, value_mask=observed)

    STRUCTURAL = ("layout", "association", "first", "areas", "reflex", "observer", "lateral", "resting_bias",
                  "dentate", "dentate_fan", "dentate_return", "dentate_hub", "memory_expansion",
                  "memory_winners", "trace_scale", "free_steps", "eligibility_steps")

    def set_genes(self, changes: dict[str, Any]) -> Genes:
        """Change genes of a living brain. Rates, temperatures, the trace and the stores' read
        strengths apply at once; a gene that shapes the connectome cannot change in a life."""
        from dataclasses import replace

        fixed = [name for name in changes if name in self.STRUCTURAL and changes[name] != getattr(self.genes, name)]
        if fixed:
            raise ValueError(f"these genes shape the brain and cannot change in a life: {fixed}")
        genes = replace(self.genes, **changes)
        brain = self.brain
        if brain.working_memory is not None:
            brain.working_memory.amplitude = genes.trace_amplitude
            brain.working_memory.decay = genes.trace_decay
        memory = brain.hippocampus
        if isinstance(memory, stores.Stores):
            memory.amplitude, memory.decay = genes.memory_amplitude, genes.memory_decay
            memory.consolidation = genes.memory_consolidation
            if memory.shown is not None:
                memory.shown.amplitude, memory.shown.decay = genes.shown_amplitude, genes.shown_decay
                memory.shown.consolidation = genes.memory_consolidation
        brain.learner.config = replace(
            brain.learner.config, eta=genes.teach_eta, eta_bias=genes.teach_eta / 10.0,
            momentum=genes.teach_momentum, temperature=genes.temperature,
            nudge=genes.teach_nudge, beta=genes.teach_beta,
        )
        actor = brain.basal_ganglia
        actor.config = replace(
            actor.config, eta=genes.reward_eta, eta_bias=genes.reward_eta_bias,
            eta_critic=genes.reward_eta_critic, gamma=genes.gamma, lam=genes.lam,
        )
        self.genes = genes
        return genes

    def fresh_stores(self, changes: dict[str, Any] | None = None) -> None:
        """Give the brain new, empty associative stores, optionally under other store genes.
        What the old stores held is gone; the cortex keeps everything it learned."""
        from dataclasses import replace

        allowed = {"memory_expansion", "memory_winners", "memory_decay", "memory_consolidation",
                   "memory_amplitude", "shown_amplitude", "shown_decay", "sleep_transfer"}
        changes = dict(changes or {})
        if set(changes) - allowed:
            raise ValueError(f"not store genes: {sorted(set(changes) - allowed)}")
        self.genes = replace(self.genes, **changes)
        anatomy.install_memory(self.brain, self.genes, self.seed)
        self._guided = None

    def calibrate(self, observations: Any) -> dict[str, float]:
        """Set the dentate thresholds from a sample of early experience."""
        return anatomy.calibrate(self.brain, np.asarray(observations, dtype=float), self.genes.dentate_active)

    def start_streams(self) -> None:
        """Begin fresh streams: live state and trace are cleared, everything learned is kept."""
        self.brain.reset()
        self._guided = None
        self._carry = None
        self._streams = 0

    # ---------------------------------------------------------------- reading the brain
    def policy(self) -> np.ndarray:
        """Action probabilities of the last settled state, one row per stream."""
        state = self.brain.basal_ganglia.state
        if state is None:
            return np.zeros((0, self.actions))
        return np.asarray(self.brain.basal_ganglia.probabilities(state))

    def value(self) -> np.ndarray:
        state = self.brain.basal_ganglia.state
        if state is None:
            return np.zeros(0)
        return np.asarray(self.brain.basal_ganglia.value(state))

    def activity(self) -> np.ndarray:
        """Activation of every neuron in the last settled state of stream 0."""
        state = self.brain.basal_ganglia.state
        if state is None:
            return np.zeros(self.brain.connectome.n)
        return np.asarray(np.atleast_2d(state.activation)[0])

    def recall(self, observations: Any) -> dict[str, dict[str, np.ndarray]]:
        """What each associative store returns for these observations, per action.

        ``lasting`` reads the persistent synapses alone; ``fresh`` is what the fading residual
        of the first stream adds on top.
        """
        memory = self.brain.hippocampus
        x = np.atleast_2d(np.asarray(observations, dtype=float))
        if isinstance(memory, stores.Stores):
            return memory.parts(x)
        zero = np.zeros((len(x), self.actions))
        return {"outcome": {"lasting": zero, "fresh": zero.copy()}}

    def sleep(self) -> dict[str, float]:
        """A night for the stores: a share of what is fresh becomes lasting, the rest fades."""
        memory = self.brain.hippocampus
        if not isinstance(memory, stores.Stores):
            return {}
        return stores.sleep(memory, self.genes.sleep_transfer)

    def probe(self, observations: Any) -> list[dict[str, Any]]:
        """What Mochi would do if it perceived each observation now, without living it.

        Uses private imagination: live activity, memory, randomness and pending outcomes stay
        untouched. One stream only.
        """
        brain = self.brain
        config = brain.learner.config
        out = []
        for row in np.atleast_2d(np.asarray(observations, dtype=float)):
            phases = brain.imagine([row[None, :]], budget=config.free_steps, tolerance=config.tolerance)
            phase = phases[-1]
            if not bool(np.all(phase.qualified)):
                out.append({"qualified": False, "policy": [], "action": -1})
                continue
            p = brain.basal_ganglia.probabilities(phase.state)[0]
            out.append({"qualified": True, "policy": [float(v) for v in p], "action": int(np.argmax(p))})
        return out

    def report(self) -> dict[str, Any]:
        c = self.counters
        free = max(1, c["routine"] + c["aroused"])
        memory = self.brain.hippocampus
        return {
            **describe(self.brain),
            "genes": self.genes.to_dict(),
            "counters": dict(c),
            "routine_share": c["routine"] / free,
            "sweeps": {mode: c["sweeps_" + mode] / max(1, c[mode]) for mode in ("routine", "aroused", "guided")},
            "agreement": c["agree"] / max(1, c["scored"]),
            "updates": int(self.brain.basal_ganglia.updates),
            "lessons_total": int(self.brain.learner.updates),
            "memory_writes": int(memory.writes) if memory is not None else 0,
        }

    # ---------------------------------------------------------------- saving
    def save_bytes(self) -> bytes:
        """The whole life as one file: the brain's own checkpoint (parameters, memories, traces
        and any pending outcome), the store of demonstrations, and the genes."""
        import io
        import json
        import os
        import tempfile
        import zipfile

        handle, path = tempfile.mkstemp(suffix=".npz")
        os.close(handle)
        try:
            self.brain.save(path)
            with open(path, "rb") as stream:
                brain = stream.read()
        finally:
            os.unlink(path)
        memory = self.brain.hippocampus
        shown = io.BytesIO()
        arrays = dict(memory.arrays()) if isinstance(memory, stores.Stores) else {}
        # what the life itself still owes: a demonstrated action awaiting its outcome, and the
        # reward of an update the brain refused
        if self._guided is not None:
            arrays["life_guided_keys"], arrays["life_guided_actions"] = self._guided
            arrays["life_guided_shown"] = np.array(self._guided_shown)
        if self._carry is not None:
            arrays["life_carry"] = self._carry
        np.savez(shown, **arrays)
        meta = {"format": "mochi-life/1", "genes": self.genes.to_dict(), "seed": self.seed,
                "counters": self.counters, "inputs": int(self.spec["inputs"]),
                "actions": list(self.spec["actions"]), "rng": self.rng.bit_generator.state}
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as archive:
            archive.writestr("life.json", json.dumps(meta))
            archive.writestr("brain.npz", brain)
            archive.writestr("shown.npz", shown.getvalue())
        return out.getvalue()

    @classmethod
    def load_bytes(cls, spec: dict[str, Any], data: bytes) -> Life:
        import io
        import json
        import os
        import tempfile
        import zipfile

        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            meta = json.loads(archive.read("life.json"))
            if meta.get("format") != "mochi-life/1":
                raise ValueError("not a mochi-life/1 file")
            brain_bytes = archive.read("brain.npz")
            with np.load(io.BytesIO(archive.read("shown.npz"))) as shown:
                arrays = {name: shown[name] for name in shown.files}
        if meta["inputs"] != int(spec["inputs"]) or meta["actions"] != list(spec["actions"]):
            raise ValueError("the saved brain does not fit these senses and actions")
        handle, path = tempfile.mkstemp(suffix=".npz")
        os.close(handle)
        try:
            with open(path, "wb") as stream:
                stream.write(brain_bytes)
            brain = Brain.load(path)
        finally:
            os.unlink(path)
        genes = Genes.from_dict(meta["genes"])
        memory = brain.hippocampus
        if isinstance(memory, SynapticMemory):
            kept = {name: arrays[name] for name in ("strength", "mass", "consolidated", "writes") if name in arrays}
            brain.hippocampus = stores.Stores.around(memory, anatomy.shown_options(genes), kept or None)
        life = cls(spec, genes, int(meta.get("seed", 0)), brain=brain)
        life.counters.update(meta.get("counters", {}))
        if "life_guided_keys" in arrays:
            life._guided = (np.asarray(arrays["life_guided_keys"], dtype=float),
                            np.asarray(arrays["life_guided_actions"], dtype=np.int64))
            life._guided_shown = bool(arrays.get("life_guided_shown", True))
        if "life_carry" in arrays:
            life._carry = np.asarray(arrays["life_carry"], dtype=float)
        if "rng" in meta:
            life.rng.bit_generator.state = meta["rng"]
        state = brain.basal_ganglia.state
        life._streams = 0 if state is None else len(np.atleast_2d(state.activation))
        return life
