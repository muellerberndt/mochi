"""A need-gated taxis chamber: can the local rule learn "follow the bearing of what I need"?

Inputs: `needs` need cells (one active) and, for each need, a ring of 8 bearing cells with one
active bearing. The answer is the active bearing of the ring that belongs to the active need:
a conjunction of need and bearing that no linear readout of the inputs can hold. One continuing
brain, lessons only on witnessed disagreement, answers scored before any lesson on that frame.

Usage: python tools/gating_chamber.py --arms '[{"name": "a", "modules": [128]}]' --lessons 6000
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import time
import warnings
from dataclasses import replace

import numpy as np


def world(rng, batch, needs, soft):
    need = rng.integers(needs, size=batch)
    bearing = rng.integers(8, size=(batch, needs))
    x = np.zeros((batch, needs + needs * 8))
    rows = np.arange(batch)
    x[rows, need] = 1.0
    for k in range(needs):
        x[rows, needs + k * 8 + bearing[:, k]] = 1.0
        if soft:  # neighbouring bearings respond a little, as a tuned population does
            x[rows, needs + k * 8 + (bearing[:, k] + 1) % 8] = 0.25
            x[rows, needs + k * 8 + (bearing[:, k] - 1) % 8] = 0.25
    return x, bearing[rows, need]


def run(arm):
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
    warnings.simplefilter("ignore")
    from cadence import Brain

    needs, batch = int(arm.get("needs", 5)), int(arm.get("batch", 16))
    lessons, block = int(arm.get("lessons", 6000)), int(arm.get("block", 500))
    rng = np.random.default_rng(int(arm.get("seed", 0)))
    inputs = needs + needs * 8
    base = Brain.compose(inputs, 8, modules=tuple(arm.get("modules", [128])), seed=1)
    learning = replace(
        base.learner.config, eta=arm.get("eta", 0.1), eta_bias=arm.get("eta", 0.1) / 10,
        momentum=arm.get("momentum", 0.0), nudge=arm.get("nudge", "cross_entropy"),
        beta=arm.get("beta", 0.1), temperature=arm.get("temperature", 0.2),
        nudged_steps=arm.get("nudged_steps", 12), normalize=arm.get("normalize", 0.0),
    )
    brain = Brain.compose(
        inputs, 8, modules=tuple(arm.get("modules", [128])), seed=1, learning=learning,
        lateral=arm.get("lateral"), resting_bias=arm.get("resting_bias", 0.0),
        working_memory_amplitude=arm.get("trace", 0.0), working_memory_decay=0.8, episodic=False,
    )
    margin = arm.get("margin", 0.5)
    rows, hits, taught, seen = [], 0, 0, 0
    started = time.time()
    for step in range(1, lessons + 1):
        x, y = world(rng, batch, needs, arm.get("soft", True))
        drive = brain.stimulus(x)
        try:
            own = brain.act(x, greedy=True)
        except RuntimeError:
            own = np.full(batch, -1)
        hits += int((own == y).sum())
        seen += batch
        state = brain.basal_ganglia.state
        sure = brain.basal_ganglia.probabilities(state)[np.arange(batch), y]
        teach = sure < margin
        if teach.any():
            brain.learner.step(drive[teach], y[teach])
            taught += int(teach.sum())
        if step % block == 0:
            rows.append({"lesson": step, "hit": round(hits / seen, 3), "taught": round(taught / seen, 3)})
            hits = taught = seen = 0
    return {"arm": arm, "rows": rows, "seconds": round(time.time() - started, 1),
            "neurons": int(brain.connectome.n)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--arms", required=True)
    parser.add_argument("--lessons", type=int, default=6000)
    parser.add_argument("--jobs", type=int, default=6)
    args = parser.parse_args()
    arms = [{"lessons": args.lessons, **arm} for arm in json.loads(args.arms)]
    with mp.get_context("spawn").Pool(args.jobs) as pool:
        for result in pool.imap_unordered(run, arms):
            curve = " ".join(f"{row['hit']:.2f}" for row in result["rows"])
            last = result["rows"][-1]
            print(f"{result['arm']['name']:26s} {result['seconds']:6.0f}s taught {last['taught']:.2f} | {curve}", flush=True)
