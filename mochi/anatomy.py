"""Mochi's brain: one connectome, settled as a whole by one ``cadence.Brain``.

Two layouts are declared. ``compose`` is the existing System 1 of the library at Mochi's size,
``Brain.compose(inputs, actions, modules=(first, association))``, and is the control. ``modality``
keeps the same foundation (one continuing brain, local repair, one settlement per decision,
working trace, associative store, reward by eligibility) and changes only the wiring: each sense
projects to its own cortical area, every area exchanges signals with one association hub, and
the hub exchanges signals with the motor cortex. Names describe software roles.

The modality layout can carry a **dentate** region: many cells that each read a few senses
through fixed synapses and stay silent below a threshold set from early experience, so that a
cell answers a conjunction ("thirsty, by the east wall, nothing in view") and few cells answer
any one moment. The dentate exchanges signals with the motor cortex through plastic synapses
that learn by the same local contrast as every other synapse, inside the same settlement. It
is the wiring of the insect mushroom body and of the dentate gyrus, and it is a gene: zero
cells is the control.

Every designed constant is a gene with a founder value. The library's compose defaults are the
controls and are kept reachable through ``Genes``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import Any

import numpy as np
from cadence import Brain, Connectome, Genome, Learner, Projection, Region, develop
from cadence.regions import motor_cortex, prefrontal_cortex

from . import stores

__all__ = ["Genes", "AREAS", "build", "calibrate", "describe", "install_memory"]

# Width of each cortical area in the modality layout.
AREAS: dict[str, int] = {"sight": 192, "smell": 48, "hearing": 64, "touch": 48, "insula": 64, "place": 96}


@dataclass(frozen=True)
class Genes:
    """The designed constants of Mochi's brain."""

    layout: str = "modality"           # "modality" or "compose" (the library's System 1 chain)
    association: int = 256             # the hub, read by the critic and held by the working trace
    first: int = 384                   # compose: width of the first processing region; 0 for one region
    areas: dict[str, int] = field(default_factory=lambda: dict(AREAS))
    reflex: tuple[str, ...] = ()       # senses with a direct one-way projection to the motor cortex
    observer: int = 0                  # optional System 2 region, 0 for none
    # the sparse conjunction region (modality layout)
    dentate: int = 1024                # cells; 0 for none (the control)
    dentate_fan: int = 8               # senses each cell reads, on average
    dentate_active: float = 0.03       # share of moments a cell answers after calibration
    dentate_return: bool = True        # motor cortex signals back to the dentate (reciprocal pairs)
    dentate_hub: bool = False          # the dentate also exchanges signals with the association hub
    lateral: float | None = None       # motor competition; None follows the library rule
    resting_bias: float = 0.0
    # short-term memory: the working trace of the hub
    trace_amplitude: float = 1.0       # compose default 3.0
    trace_decay: float = 0.8           # compose default 0.2
    trace_scale: float = 12.0          # prefrontal to association projection
    # demonstrations (the teacher contrast)
    teach_eta: float = 0.1             # compose default 0.5
    teach_momentum: float = 0.0        # compose default 0.9
    teach_margin: float = 0.5          # a demonstration teaches where the own answer gives it less; >1 teaches always
    teach_nudge: str = "cross_entropy" # or "quadratic"
    teach_beta: float = 0.1            # nudge strength
    temperature: float = 0.2
    # reward (eligibility and dopamine)
    reward_eta: float = 0.1            # compose default 1.0
    reward_eta_bias: float = 0.01      # compose default 0.05
    reward_eta_critic: float = 0.3
    gamma: float = 0.9
    lam: float = 0.8
    eligibility_steps: int = 12
    free_steps: int = 1024
    # the associative stores between the senses and the motor cortex (memory, read as a motor drive)
    memory_expansion: int = 0          # pattern-separated key width; 0 keeps raw keys (library default)
    memory_winners: int = 24
    memory_decay: float = 0.9          # fading of the fast residual per write
    memory_consolidation: float = 0.05
    memory_amplitude: float = 1.0
    shown_amplitude: float = 0.0       # read strength of the store of demonstrations; 0 leaves it out
    shown_decay: float = 0.9
    sleep_transfer: float = 0.5        # share of a fresh residual that a night makes lasting

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @staticmethod
    def from_dict(values: dict[str, Any]) -> Genes:
        values = dict(values)
        if "reflex" in values:
            values["reflex"] = tuple(values["reflex"])
        return Genes(**values)


def _configs(genes: Genes):
    """The composition's own learning and reward settings with Mochi's genes applied."""
    base = Brain.compose(4, 2, modules=(4,), seed=0)
    learning = replace(
        base.learner.config,
        eta=genes.teach_eta, eta_bias=genes.teach_eta / 10.0, momentum=genes.teach_momentum,
        temperature=genes.temperature, free_steps=genes.free_steps,
        nudge=genes.teach_nudge, beta=genes.teach_beta,
    )
    reward = replace(
        base.basal_ganglia.config,
        eta=genes.reward_eta, eta_bias=genes.reward_eta_bias, eta_critic=genes.reward_eta_critic,
        gamma=genes.gamma, lam=genes.lam, eligibility_steps=genes.eligibility_steps,
    )
    return learning, reward


def _modality_genome(spec: dict[str, Any], genes: Genes) -> Genome:
    senses = spec["senses"]
    spans, at = {}, 0
    for sense in senses:
        spans[sense["name"]] = range(at, at + sense["size"])
        at += sense["size"]
    sheet = Connectome.from_synapses(at, pre=[], post=[], populations=spans, label="mochi-senses")
    areas = [name for name in genes.areas if any(s["area"] == name for s in senses)]
    regions: list[Region] = [Region("sensory", circuit=sheet)]
    regions.extend(Region(name, genes.areas[name]) for name in areas)
    regions.extend((
        Region("association", genes.association),
        prefrontal_cortex(genes.association),
        motor_cortex(len(spec["actions"]), lateral=_lateral(genes, len(spec["actions"]))),
    ))
    projections = [
        Projection(f"sensory/{sense['name']}", sense["area"], reciprocal=False) for sense in senses
    ]
    projections.extend(Projection(name, "association") for name in areas)
    projections.append(Projection("association", "motor"))
    projections.append(
        Projection("prefrontal", "association", scale=genes.trace_scale, reciprocal=False)
    )
    projections.extend(
        Projection(f"sensory/{name}", "motor", reciprocal=False) for name in genes.reflex
    )
    if genes.dentate:
        regions.append(Region("dentate", genes.dentate))
        # Each cell samples a few senses with excitatory synapses of order one; 14.3 undoes the
        # fan scaling of ``develop`` for this pair of sizes only approximately, and the
        # calibration sets every threshold from the actual input.
        scale = 1.0 / np.sqrt(6.0 / (at + genes.dentate))
        projections.append(Projection(
            "sensory", "dentate", density=min(1.0, genes.dentate_fan / at), sign=1.0, scale=scale,
            reciprocal=False,
        ))
        projections.append(Projection("dentate", "motor", reciprocal=genes.dentate_return))
        if genes.dentate_hub:
            projections.append(Projection("dentate", "association"))
    if genes.observer:
        regions.append(Region("observer_0", genes.observer))
        projections.extend(Projection(name, "observer_0") for name in [*areas, "association", "motor"])
    return Genome(tuple(regions), tuple(projections), label="mochi-modality")


def _fix_dentate(brain: Brain) -> None:
    """The senses-to-dentate synapses and the dentate thresholds are development, not lessons."""
    c = brain.connectome
    if "dentate" not in c.populations:
        return
    cells = np.asarray(c.populations["dentate"], dtype=np.int64)
    senses = np.asarray(c.populations["sensory"], dtype=np.int64)
    fixed = np.isin(c.pre, senses) & np.isin(c.post, cells)
    neurons = np.ones(c.n, dtype=bool)
    neurons[cells] = False
    old = brain.learner
    learner = Learner(
        brain.brain, list(brain.motor_index), old.config, plastic_synapses=~fixed,
        plastic_neurons=neurons, slots=[int(k) for k in old.slot_sizes],
    )
    brain.learner = learner
    brain.basal_ganglia.learner = learner


def calibrate(brain: Brain, observations: np.ndarray, active: float) -> dict[str, float]:
    """Set each dentate cell's threshold so it answers ``active`` of the sampled moments.

    A cell's threshold is a negative bias equal to the matching quantile of its input from the
    senses over ``observations``. This is the cell's own homeostasis over early experience;
    nothing about the task enters.
    """
    c = brain.connectome
    if "dentate" not in c.populations:
        return {}
    graph = brain.brain
    cells = np.asarray(c.populations["dentate"], dtype=np.int64)
    senses = np.asarray(c.populations["sensory"], dtype=np.int64)
    weights = np.asarray(graph.weights)
    keep = np.isin(c.pre, senses) & np.isin(c.post, cells)
    matrix = np.zeros((len(senses), len(cells)))
    matrix[np.searchsorted(senses, c.pre[keep]), np.searchsorted(cells, c.post[keep])] = weights[keep]
    x = np.asarray(observations, dtype=float).reshape(-1, len(senses))
    emitted = graph.neuron_model.activation(x * graph.neuron_model.stimulus_amplitude)
    drive = emitted @ matrix
    threshold = np.quantile(drive, 1.0 - active, axis=0)
    bias = np.array(graph.bias, dtype=float)
    bias[cells] = -threshold
    graph.bias = bias
    answering = (drive > threshold).sum(axis=1)
    return {"cells": int(len(cells)), "mean_answering": float(answering.mean()),
            "fewest_answering": float(answering.min()), "most_answering": float(answering.max())}


def _lateral(genes: Genes, actions: int) -> float:
    if genes.lateral is not None:
        return float(genes.lateral)
    return -0.5 if actions <= 8 else 0.0    # the library rule (issue 124)


def install_memory(brain: Brain, genes: Genes, seed: int = 0) -> None:
    """Configure the associative stores between the senses and the motor cortex.

    The library default keys the outcome store by the raw observation. With
    ``memory_expansion`` the key first passes a fixed sparse expansion (``PatternSeparator``),
    so two moments interfere only as far as their sparse codes overlap.
    """
    brain.hippocampus = stores.make(
        brain.sensory_index, brain.motor_index, expansion=genes.memory_expansion,
        winners=genes.memory_winners, seed=seed,
        outcome=dict(decay=genes.memory_decay, amplitude=genes.memory_amplitude,
                     consolidation=genes.memory_consolidation),
        shown=shown_options(genes),
    )


def shown_options(genes: Genes) -> dict[str, float]:
    return dict(decay=genes.shown_decay, amplitude=genes.shown_amplitude,
                consolidation=genes.memory_consolidation)


def build(spec: dict[str, Any], genes: Genes | None = None, seed: int = 0) -> Brain:
    """One continuing System 1 brain for the declared senses and actions."""
    genes = genes or Genes()
    inputs, actions = int(spec["inputs"]), len(spec["actions"])
    learning, reward = _configs(genes)
    options = dict(
        learning=learning, reward=reward, resting_bias=genes.resting_bias,
        working_memory_amplitude=genes.trace_amplitude, working_memory_decay=genes.trace_decay,
        consolidation=genes.memory_consolidation,
    )
    if genes.layout == "compose":
        brain = Brain.compose(
            inputs, actions,
            modules=(genes.first, genes.association) if genes.first else (genes.association,),
            observers=(genes.observer,) if genes.observer else (),
            lateral=genes.lateral, seed=seed, **options,
        )
    elif genes.layout == "modality":
        brain = Brain(develop(_modality_genome(spec, genes), seed=seed), seed=seed, **options)
    else:
        raise ValueError(f"unknown layout {genes.layout!r}: modality or compose")
    _fix_dentate(brain)
    install_memory(brain, genes, seed)
    return brain


def describe(brain: Brain) -> dict[str, Any]:
    """Region sizes and synapse counts."""
    c = brain.connectome
    regions = {name: len(members) for name, members in c.populations.items() if "/" not in name}
    return {"neurons": int(c.n), "synapses": int(c.synapses), "regions": regions}


def region_of(brain: Brain) -> np.ndarray:
    """Index of each neuron's top-level region, in the order of ``describe``."""
    c = brain.connectome
    names = [name for name in c.populations if "/" not in name]
    out = np.full(c.n, -1, dtype=np.int64)
    for index, name in enumerate(names):
        out[np.asarray(c.populations[name], dtype=np.int64)] = index
    return out
