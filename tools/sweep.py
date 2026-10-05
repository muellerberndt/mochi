"""Compare brain settings on the mother's recorded days.

Each arm lives the guided phase of the bootstrap on the same recorded streams: the brain's own
free answer is scored against the mother's action before any lesson on that frame, then the
lesson follows the arm's teaching policy. Two conventional learners trained by backpropagation
on the same stream (a linear softmax and a one-hidden-layer network) are the matched baselines;
uniform random is 1/17.

Usage:
  python tools/sweep.py --data runs/dataset --arms tools/arms.json --out runs/sweep --jobs 8
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import time
import warnings
from pathlib import Path

import numpy as np

GROUPS = {"rest": [0], "move": list(range(1, 9)), "eat": [9], "sleep": [10], "pounce": [11],
          "call": [12], "trick": [13, 14, 15, 16]}


def load(data: Path):
    meta = json.loads((data / "meta.json").read_text())
    streams, ticks, inputs = meta["streams"], meta["ticks"], meta["inputs"]
    obs = np.fromfile(data / "observations.f32", dtype=np.float32).reshape(ticks, streams, inputs)
    labels = np.fromfile(data / "labels.u8", dtype=np.uint8).reshape(ticks, streams).astype(np.int64)
    rewards = np.fromfile(data / "rewards.f32", dtype=np.float32).reshape(ticks, streams)
    return meta, obs.astype(float), labels, rewards.astype(float)


class Blocks:
    def __init__(self, block: int):
        self.block = block
        self.rows: list[dict] = []
        self.reset()

    def reset(self):
        self.hit = {g: 0 for g in GROUPS}
        self.n = {g: 0 for g in GROUPS}
        self.taught = 0
        self.sweeps = 0
        self.ticks = 0

    def add(self, own, labels, taught=0, sweeps=0):
        for g, members in GROUPS.items():
            mask = np.isin(labels, members)
            self.n[g] += int(mask.sum())
            self.hit[g] += int((own[mask] == labels[mask]).sum())
        self.taught += taught
        self.sweeps += sweeps
        self.ticks += 1
        if self.ticks % self.block == 0:
            self.flush()

    def flush(self):
        total, hits = sum(self.n.values()), sum(self.hit.values())
        if not total:
            return
        row = {"tick": self.ticks, "agree": round(hits / total, 4), "taught": round(self.taught / total, 4),
               "sweeps": round(self.sweeps / self.block, 1)}
        row.update({g: (round(self.hit[g] / self.n[g], 4) if self.n[g] else None) for g in GROUPS})
        # the mean over action groups: every kind of action counts the same
        present = [self.hit[g] / self.n[g] for g in GROUPS if self.n[g]]
        row["balanced"] = round(float(np.mean(present)), 4)
        self.rows.append(row)
        ticks = self.ticks
        self.reset()
        self.ticks = ticks


def run_cadence(arm, meta, obs, labels, rewards, block):
    from mochi import Genes, Life

    warnings.simplefilter("ignore")
    life = Life(meta["spec"], Genes.from_dict(arm.get("genes", {})), seed=int(arm.get("seed", 1)))
    ticks = min(int(arm.get("ticks", len(obs))), len(obs))
    if life.genes.dentate and life.genes.layout == "modality":
        # thresholds from moments outside the lessons scored below
        life.calibrate(obs[-200:].reshape(-1, obs.shape[-1]))
    blocks = Blocks(block)
    for t in range(ticks):
        out = life.tick(obs[t], rewards[t], guide=labels[t], margin=arm.get("margin"))
        if out["refused"]:
            blocks.add(np.full(labels[t].shape, -1), labels[t], 0, out.get("sweeps", 0))
            continue
        blocks.add(np.asarray(out["own"]), labels[t], out["lesson"]["taught"], out["sweeps"])
    report = life.report()
    return blocks.rows, {"neurons": report["neurons"], "synapses": report["synapses"],
                         "refused": report["counters"]["refused"], "lessons": report["counters"]["lessons"]}


def run_backprop(arm, meta, obs, labels, rewards, block):
    """A softmax readout, linear or through one hidden layer, trained by Adam on the same stream."""
    rng = np.random.default_rng(int(arm.get("seed", 1)))
    inputs, actions, hidden = meta["inputs"], len(meta["spec"]["actions"]), int(arm.get("hidden", 0))
    rate = float(arm.get("rate", 1e-3))
    shapes = [(inputs, hidden), (hidden,), (hidden, actions), (actions,)] if hidden else [(inputs, actions), (actions,)]
    params = [rng.normal(0, np.sqrt(2.0 / s[0]), s) if len(s) == 2 else np.zeros(s) for s in shapes]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    step = 0
    ticks = min(int(arm.get("ticks", len(obs))), len(obs))
    blocks = Blocks(block)
    for t in range(ticks):
        x, y = obs[t], labels[t]
        if hidden:
            h = np.maximum(x @ params[0] + params[1], 0)
            z = h @ params[2] + params[3]
        else:
            z = x @ params[0] + params[1]
        blocks.add(z.argmax(axis=1), y, len(y))
        p = np.exp(z - z.max(axis=1, keepdims=True))
        p /= p.sum(axis=1, keepdims=True)
        p[np.arange(len(y)), y] -= 1
        p /= len(y)
        if hidden:
            grads = [None, None, h.T @ p, p.sum(axis=0)]
            back = (p @ params[2].T) * (h > 0)
            grads[0], grads[1] = x.T @ back, back.sum(axis=0)
        else:
            grads = [x.T @ p, p.sum(axis=0)]
        step += 1
        for i, g in enumerate(grads):
            m[i] = 0.9 * m[i] + 0.1 * g
            v[i] = 0.999 * v[i] + 0.001 * g * g
            params[i] -= rate * (m[i] / (1 - 0.9 ** step)) / (np.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8)
    return blocks.rows, {"parameters": int(sum(p.size for p in params))}


def run_arm(job):
    arm, data, out, block = job
    meta, obs, labels, rewards = load(Path(data))
    started = time.time()
    try:
        runner = run_backprop if arm.get("kind") == "backprop" else run_cadence
        rows, info = runner(arm, meta, obs, labels, rewards, block)
        result = {"arm": arm, "rows": rows, "info": info, "seconds": round(time.time() - started, 1)}
    except Exception as error:  # noqa: BLE001 - a failed arm is a result
        result = {"arm": arm, "rows": [], "error": f"{type(error).__name__}: {error}",
                  "seconds": round(time.time() - started, 1)}
    Path(out).mkdir(parents=True, exist_ok=True)
    (Path(out) / f"{arm['name']}.json").write_text(json.dumps(result, indent=1))
    return result


def table(results):
    lines = []
    header = f"{'arm':34s} {'sec':>5s} {'agree':>6s} {'bal':>6s} " + " ".join(f"{g:>6s}" for g in GROUPS) + f" {'taught':>6s} {'sweeps':>6s}"
    lines.append(header)
    for r in sorted(results, key=lambda r: -(r["rows"][-1]["balanced"] if r["rows"] else -1)):
        if not r["rows"]:
            lines.append(f"{r['arm']['name']:34s} {r['seconds']:5.0f} ERROR {r.get('error', '')[:90]}")
            continue
        last = r["rows"][-1]
        cells = " ".join(f"{(last[g] if last[g] is not None else float('nan')):6.3f}" for g in GROUPS)
        lines.append(f"{r['arm']['name']:34s} {r['seconds']:5.0f} {last['agree']:6.3f} {last['balanced']:6.3f} {cells} {last['taught']:6.3f} {last['sweeps']:6.0f}")
    return "\n".join(lines)


def main():
    for name in ("VECLIB_MAXIMUM_THREADS", "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ.setdefault(name, "1")          # one thread per arm; the pool is the parallelism
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="runs/dataset")
    parser.add_argument("--arms", required=True)
    parser.add_argument("--out", default="runs/sweep")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--block", type=int, default=500)
    args = parser.parse_args()
    arms = json.loads(Path(args.arms).read_text())
    jobs = [(arm, args.data, args.out, args.block) for arm in arms]
    with mp.get_context("spawn").Pool(args.jobs) as pool:
        results = []
        for result in pool.imap_unordered(run_arm, jobs):
            results.append(result)
            last = result["rows"][-1] if result["rows"] else {}
            print(f"done {result['arm']['name']} in {result['seconds']}s: {last.get('agree')} balanced {last.get('balanced')} {result.get('error', '')}", flush=True)
    text = table(results)
    print(text)
    (Path(args.out) / "table.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
