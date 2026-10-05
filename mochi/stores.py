"""Mochi's associative stores: what an action brought, and what was shown.

Both are the library's ``SynapticMemory``: a persistent matrix shared by every stream plus a
fading residual per stream, written by a normalized delta rule and read as a drive into the
motor cortex, where it settles with the rest of the brain. Both are addressed through one
``PatternSeparator``: the observation is expanded onto many cells, the strongest few stay
active, and two moments interfere only as far as their sparse codes overlap. A conjunction
such as "thirsty, at this place, nothing in view" gets cells of its own, so a single local
write can hold what a dense layer needs many lessons for.

* The **outcome store** is the one ``cadence.Brain`` owns and writes: the reward of the action
  the brain itself chose, for the situation it chose it in.
* The **shown store** records demonstrations: the action a guide moved the body through is
  worth one there and every other action nothing. The mother writes it during the bootstrap;
  the player writes it by showing a trick.

``Stores`` is the outcome store with the shown store attached, so ``Brain.act``, ``learn`` and
``imagine`` read both wherever they read memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from cadence import PatternSeparator, SynapticMemory

__all__ = ["Stores", "sleep"]


@dataclass
class Stores(SynapticMemory):
    shown: SynapticMemory | None = field(default=None, repr=False)

    def recall(self, key: np.ndarray) -> np.ndarray:
        """The motor drive both stores return for these observations."""
        cue = self._port(key, len(self.pre), "key")
        code = self.code(cue)
        return np.asarray(self._read(self, code) + (self._read(self.shown, code) if self.shown is not None else 0.0))

    def code(self, cue: np.ndarray) -> np.ndarray:
        """The unit-length sparse code of ``(batch, senses)`` observations."""
        if self.separator is not None:
            cue = self.separator.code(cue)
        return np.asarray(self._delta_unit(cue))

    @staticmethod
    def _read(memory: SynapticMemory, code: np.ndarray) -> np.ndarray:
        if len(memory.strength) == len(code):
            read = (code[:, None, :] @ memory.strength)[:, 0, :]
        else:
            read = code @ memory.consolidated
        return np.asarray(memory.amplitude * read)

    def parts(self, key: np.ndarray) -> dict[str, dict[str, np.ndarray]]:
        """Each store's read split into what lasts and what the first stream's residual adds."""
        code = self.code(self._port(key, len(self.pre), "key"))
        out = {}
        for name, memory in (("outcome", self), ("shown", self.shown)):
            if memory is None:
                continue
            lasting = memory.amplitude * (code @ memory.consolidated)
            total = memory.amplitude * (code @ memory.strength[0]) if len(memory.strength) else lasting
            out[name] = {"lasting": lasting, "fresh": total - lasting}
        return out

    def show(self, key: np.ndarray, actions: np.ndarray, salience: np.ndarray | None = None) -> None:
        """Record demonstrations: in each of these moments the shown action is worth one."""
        if self.shown is None:
            return
        actions = np.asarray(actions, dtype=np.int64)
        value = np.zeros((len(actions), len(self.post)))
        value[np.arange(len(actions)), actions] = 1.0
        self.shown.observe(np.asarray(key, dtype=float), value, salience=salience)

    def arrays(self) -> dict[str, np.ndarray]:
        """The shown store's state, for a checkpoint beside the brain's own."""
        if self.shown is None:
            return {}
        return {"strength": self.shown.strength, "mass": self.shown.mass,
                "consolidated": self.shown.consolidated, "writes": np.array(self.shown.writes)}

    @classmethod
    def around(cls, memory: SynapticMemory, shown: dict[str, Any], arrays: dict[str, np.ndarray] | None = None) -> Stores:
        """Wrap a loaded outcome store and attach the shown store."""
        stores = cls(
            memory.pre, memory.post, decay=memory.decay, rate=memory.rate, amplitude=memory.amplitude,
            consolidation=memory.consolidation, separator=memory.separator,
        )
        stores.strength, stores.mass, stores.writes = memory.strength, memory.mass, memory.writes
        stores.consolidated = memory.consolidated
        stores.shown = SynapticMemory(memory.pre, memory.post, separator=memory.separator, **shown)
        if arrays:
            stores.shown.strength = np.asarray(arrays["strength"], dtype=float)
            stores.shown.mass = np.asarray(arrays["mass"], dtype=float)
            stores.shown.consolidated = np.asarray(arrays["consolidated"], dtype=float)
            stores.shown.writes = int(arrays["writes"])
        return stores


def make(senses: np.ndarray, motor: np.ndarray, *, expansion: int, winners: int, seed: int,
         outcome: dict[str, Any], shown: dict[str, Any]) -> Stores:
    separator = PatternSeparator(len(senses), expansion, winners, seed=seed) if expansion else None
    stores = Stores(senses, motor, separator=separator, **outcome)
    stores.shown = SynapticMemory(senses, motor, separator=separator, **shown)
    return stores


def sleep(stores: Stores, transfer: float) -> dict[str, float]:
    """A night for the stores: a share of each fresh residual becomes lasting, the rest fades.

    ``transfer`` is the share kept (a gene; 0 keeps only what repetition and salience had
    already consolidated). Returns how much each store held fresh before the night.
    """
    held = {}
    for name, memory in (("outcome", stores), ("shown", stores.shown)):
        if memory is None or not len(memory.strength):
            continue
        fresh = memory.strength[0] - memory.consolidated
        held[name] = float(np.abs(fresh).sum())
        memory.consolidated = memory.consolidated + transfer * fresh
        memory.strength = np.broadcast_to(memory.consolidated, memory.strength.shape).copy()
        memory.mass = np.zeros_like(memory.mass)
    return held
