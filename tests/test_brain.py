"""The brain host's contracts: who owns an outcome, what a calm tick leaves alone, and that a
saved life continues as it was. Run with ``pytest -q tests``."""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.simplefilter("ignore")

from mochi import Genes, Life  # noqa: E402
from mochi.host import Host  # noqa: E402

SPEC = json.loads((Path(__file__).resolve().parent.parent / "mochi" / "spec.json").read_text())
SMALL = dict(layout="compose", first=0, association=48, dentate=0, trace_amplitude=0.3, temperature=0.1)


def moments(count: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = (rng.random((count, SPEC["inputs"])) < 0.14) * rng.uniform(0.3, 1.0, (count, SPEC["inputs"]))
    return x


def life(**genes) -> Life:
    return Life(SPEC, Genes(**{**SMALL, **genes}), seed=1)


def parameters(creature: Life) -> np.ndarray:
    return np.concatenate([np.asarray(creature.brain.brain.efficacy), np.asarray(creature.brain.brain.bias)])


def test_spec_matches_the_brain():
    creature = life()
    assert len(creature.brain.sensory_index) == SPEC["inputs"] == 223
    assert len(creature.brain.motor_index) == len(SPEC["actions"]) == 17


def test_a_calm_tick_learns_nothing_and_writes_nothing():
    creature = life()
    x = moments(6)
    creature.tick(x[:1], aroused=False)
    before, writes, updates = parameters(creature), creature.brain.hippocampus.writes, creature.brain.basal_ganglia.updates
    for row in x[1:]:
        out = creature.tick(row[None], [0.05], aroused=False)
        assert out["mode"] == "routine"
    assert np.array_equal(parameters(creature), before)
    assert creature.brain.hippocampus.writes == writes
    assert creature.brain.basal_ganglia.updates == updates
    assert creature.counters["dropped"] == 0                  # routine outcomes are nothing to remember


def test_what_wakes_it_is_remembered_for_the_action_it_took():
    creature = life()
    x = moments(3)
    calm = creature.tick(x[:1], aroused=False)                # a routine answer
    chosen = calm["action"][0]
    before, updates = parameters(creature), creature.brain.basal_ganglia.updates
    creature.tick(x[1:2], [0.8], aroused=True, salience=[4.8])   # praise arrives and arouses
    read = creature.recall(x[:1])["outcome"]
    assert (read["lasting"] + read["fresh"])[0, chosen] == pytest.approx(0.8, abs=1e-6)
    assert read["lasting"][0, chosen] > 0.2                   # emphasis made part of it lasting at once
    assert creature.brain.basal_ganglia.updates == updates    # a greedy read carried no eligibility
    assert np.array_equal(parameters(creature), before)


def test_an_aroused_tick_learns_from_its_own_outcome_once():
    creature = life()
    x = moments(4)
    creature.tick(x[:1], aroused=True)
    assert creature.brain.basal_ganglia._pending is not None
    creature.tick(x[1:2], [0.7], aroused=True)
    assert creature.brain.basal_ganglia.updates == 1
    assert creature.brain.hippocampus.writes == 1
    # the chain ends on a calm tick: the pending outcome is closed, then nothing more is learned
    creature.tick(x[2:3], [0.2], aroused=False)
    assert creature.brain.basal_ganglia.updates == 2
    assert creature.brain.basal_ganglia._pending is None
    creature.tick(x[3:4], [0.9], aroused=False)
    assert creature.brain.basal_ganglia.updates == 2


def test_a_demonstration_teaches_on_disagreement_and_owns_no_reward_credit():
    creature = life()
    x = moments(1)
    out = creature.tick(x, guide=[13], margin=2.0)
    assert out["mode"] == "guided" and out["action"] == [13]
    assert out["lesson"]["taught"] == 1
    assert creature.brain.basal_ganglia._pending is None      # a greedy read carries no eligibility
    # repeating the same moment makes the brain's own answer the demonstrated one, and once the
    # brain is sure of it the lessons stop
    for _ in range(600):
        out = creature.tick(x, guide=[13])
        if out["lesson"]["taught"] == 0:
            break
    assert out["own"] == [13]
    assert out["lesson"]["taught"] == 0                       # no disagreement, no lesson
    assert out["lesson"]["sure"][0] >= creature.genes.teach_margin
    # the outcome of the executed (demonstrated) action is recorded in the store, for that action only
    writes = creature.brain.hippocampus.writes
    creature.tick(x, [0.8], aroused=False)
    assert creature.brain.hippocampus.writes == writes + 1
    read = creature.recall(x)["outcome"]
    assert (read["lasting"] + read["fresh"])[0, 13] > 0.5
    assert np.abs(np.delete((read["lasting"] + read["fresh"])[0], 13)).max() < 1e-9


def test_teaching_margin_above_one_teaches_every_tick():
    creature = life()
    x = moments(1)
    lessons = 0
    for _ in range(5):
        lessons += creature.tick(x, guide=[3], margin=2.0)["lesson"]["taught"]
    assert lessons == 5


def test_imagination_is_private():
    creature, twin = life(), life()
    x = moments(3)
    for row in x[:2]:
        creature.tick(row[None], [0.1], aroused=True)
        twin.tick(row[None], [0.1], aroused=True)
    answers = creature.probe(x)
    assert all(answer["qualified"] for answer in answers)
    a = creature.tick(x[2:3], [0.3], aroused=True)
    b = twin.tick(x[2:3], [0.3], aroused=True)
    assert a["action"] == b["action"]
    assert np.array_equal(parameters(creature), parameters(twin))


def test_a_saved_life_continues_as_it_was():
    creature = life()
    x = moments(8)
    for row in x[:5]:
        creature.tick(row[None], [0.2], aroused=True)
    creature.tick(x[5:6], guide=[14], margin=2.0)
    saved = creature.save_bytes()
    again = Life.load_bytes(SPEC, saved)
    assert again.genes == creature.genes
    assert np.array_equal(parameters(again), parameters(creature))
    for row in x[6:]:
        a = creature.tick(row[None], [0.4], aroused=True)
        b = again.tick(row[None], [0.4], aroused=True)
        assert a["action"] == b["action"] and a["sweeps"] == b["sweeps"]
    assert np.allclose(parameters(again), parameters(creature))


def test_a_night_makes_part_of_what_is_fresh_lasting():
    creature = life(sleep_transfer=0.5)
    x = moments(2)
    creature.tick(x[:1], guide=[13], margin=2.0)
    creature.tick(x[1:2], [1.0], aroused=False)               # the demonstrated action's outcome
    before = creature.recall(x[:1])["outcome"]
    fresh, lasting = before["fresh"][0, 13], before["lasting"][0, 13]
    assert fresh > 0.3
    held = creature.sleep()
    after = creature.recall(x[:1])["outcome"]
    assert held["outcome"] > 0
    assert abs(after["fresh"][0, 13]) < 1e-9
    assert after["lasting"][0, 13] == pytest.approx(lasting + 0.5 * fresh, rel=1e-6)


def test_genes_that_shape_the_brain_cannot_change_in_a_life():
    creature = life()
    creature.set_genes({"trace_amplitude": 0.1, "teach_eta": 0.2})
    assert creature.brain.working_memory.amplitude == 0.1
    assert creature.brain.learner.config.eta == 0.2
    with pytest.raises(ValueError):
        creature.set_genes({"association": 96})


def test_both_layouts_build_and_the_dentate_keeps_its_wiring():
    plain = Life(SPEC, Genes(layout="compose", first=0, association=32, dentate=0), seed=2)
    assert set(plain.brain.connectome.populations) >= {"sensory", "association", "prefrontal", "motor"}
    wired = Life(SPEC, Genes(layout="modality", association=32, dentate=64,
                             areas={"sight": 16, "smell": 8, "hearing": 8, "touch": 8, "insula": 8, "place": 8}), seed=2)
    populations = wired.brain.connectome.populations
    assert {"sight", "smell", "hearing", "touch", "insula", "place", "dentate"} <= set(populations)
    report = wired.calibrate(moments(200))
    assert 0 < report["mean_answering"] < 16
    fixed = int((~wired.brain.learner.plastic_synapses).sum())
    assert fixed > 0
    before = np.asarray(wired.brain.brain.efficacy)[~wired.brain.learner.plastic_synapses].copy()
    for row in moments(6, seed=3):
        wired.tick(row[None], guide=[2], margin=2.0)
    assert np.array_equal(np.asarray(wired.brain.brain.efficacy)[~wired.brain.learner.plastic_synapses], before)


def test_the_host_speaks_json_and_reports_failures():
    host = Host()
    assert "error" in json.loads(host.handle_json(json.dumps({"op": "tick", "obs": [[0.0]]})))
    boot = json.loads(host.handle_json(json.dumps({"op": "boot", "spec": SPEC, "genes": SMALL, "seed": 3})))
    assert boot["report"]["neurons"] == 223 + 48 + 48 + 17
    x = moments(1).tolist()
    out = json.loads(host.handle_json(json.dumps({
        "op": "tick", "obs": x, "reward": [0.0], "aroused": True,
        "want": {"policy": True, "learning": True, "frames": 6, "recall": True},
    })))
    assert len(out["policy"][0]) == 17 and abs(sum(out["policy"][0]) - 1) < 1e-3
    assert out["frames"] and out["frames"][0]["kind"] == "free"
    saved = json.loads(host.handle_json(json.dumps({"op": "save"})))
    other = Host()
    loaded = json.loads(other.handle_json(json.dumps({"op": "boot", "spec": SPEC, "npz": saved["npz"]})))
    assert loaded["loaded"] is True
    atlas = json.loads(host.handle_json(json.dumps({"op": "atlas", "lines": 500})))
    assert atlas["atlas"]["n"] == boot["report"]["neurons"]
