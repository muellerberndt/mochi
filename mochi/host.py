"""The brain host: one message in, one message out.

The page runs this module inside Pyodide in a worker; the headless harness runs it as a child
process and speaks JSON lines over its pipes. Both call ``Host.handle`` with the same messages,
so the brain that is bootstrapped and measured headless is the code the page runs.

Run ``python -m mochi.host`` for the JSON-lines server.
"""

from __future__ import annotations

import base64
import json
import sys
from typing import Any

import numpy as np

from .anatomy import Genes
from .life import Life

__all__ = ["Host", "serve"]


# Display names of the sense organs and of the brain's regions, with the role that colours them.
SENSE_ORGANS = {"sight": "Eyes", "smell": "Nose and tongue", "hearing": "Ears", "touch": "Skin and body",
                "insula": "Needs", "place": "Sense of place"}
REGION_NAMES = {
    "sight": ("Visual cortex", "vision"), "smell": ("Smell and taste cortex", "sensory"),
    "hearing": ("Auditory cortex", "sensory"), "touch": ("Body cortex", "sensory"),
    "insula": ("Insula", "value"), "place": ("Place cortex", "sensory"),
    "module_0": ("Sensory cortex", "sensory"),
    "association": ("Association hub", "association"), "prefrontal": ("Working memory", "memory"),
    "dentate": ("Dentate", "memory"), "motor": ("Motor cortex", "motor"),
    "observer_0": ("Observer", "association"),
}


def _b64(values: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(values).tobytes()).decode("ascii")


class Host:
    def __init__(self) -> None:
        self.life: Life | None = None
        self.spec: dict[str, Any] | None = None

    def handle(self, message: dict[str, Any]) -> dict[str, Any]:
        op = message.get("op")
        method = getattr(self, "op_" + str(op), None)
        if method is None:
            raise ValueError(f"unknown op {op!r}")
        if op != "boot" and self.life is None:
            raise RuntimeError("boot first")
        return method(message)

    def handle_json(self, text: str) -> str:
        """The same call for a worker: a JSON string in, a JSON string out, errors included."""
        try:
            return json.dumps(self.handle(json.loads(text)))
        except Exception as error:  # noqa: BLE001 - the caller owns the display of failures
            return json.dumps({"error": f"{type(error).__name__}: {error}"})

    # ---------------------------------------------------------------- lifecycle
    def op_boot(self, message: dict[str, Any]) -> dict[str, Any]:
        self.spec = message["spec"]
        genes = Genes.from_dict(message["genes"]) if message.get("genes") else None
        seed = int(message.get("seed", 0))
        data = self._payload(message)
        if data is not None:
            self.life = Life.load_bytes(self.spec, data)
        else:
            self.life = Life(self.spec, genes, seed)
        return {"report": self.life.report(), "loaded": data is not None}

    @staticmethod
    def _payload(message: dict[str, Any]) -> bytes | None:
        if message.get("path"):
            with open(message["path"], "rb") as stream:
                return stream.read()
        if message.get("npz"):
            return base64.b64decode(message["npz"])
        return None

    def op_load(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None and self.spec is not None
        data = self._payload(message)
        if data is None:
            raise ValueError("load needs a path or npz")
        self.life = Life.load_bytes(self.spec, data)
        return {"report": self.life.report()}

    def op_save(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        data = self.life.save_bytes()
        if message.get("path"):
            with open(message["path"], "wb") as stream:
                stream.write(data)
            return {"bytes": len(data), "path": message["path"]}
        return {"bytes": len(data), "npz": base64.b64encode(data).decode("ascii")}

    def op_streams(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        self.life.start_streams()
        return {}

    # ---------------------------------------------------------------- living
    def op_tick(self, message: dict[str, Any]) -> dict[str, Any]:
        life = self.life
        assert life is not None
        observations = np.asarray(message["obs"], dtype=float)
        want = message.get("want") or {}
        records: list[Any] = []
        options = dict(
            aroused=bool(message.get("aroused", True)), guide=message.get("guide"),
            teacher=message.get("teacher"), salience=message.get("salience"),
            margin=message.get("margin"), independence=float(message.get("independence") or 0.0),
            contrast=message.get("contrast"), record=bool(message.get("record", True)),
        )
        if want.get("frames"):
            from cadence import record_settlements

            with record_settlements(records.append, label="tick"):
                out = life.tick(observations, message.get("reward"), **options)
            out["frames"] = self._frames(records, int(want["frames"]))
        else:
            out = life.tick(observations, message.get("reward"), **options)
        if out["refused"]:
            return out
        if want.get("policy"):
            out["policy"] = [[round(float(v), 4) for v in row] for row in life.policy()]
            out["value"] = [round(float(v), 4) for v in life.value()]
        if want.get("activity"):
            level = np.clip((life.activity() + 0.1) / 1.1, 0.0, 1.0)
            out["activity"] = _b64((level * 255).astype(np.uint8))
        if want.get("recall"):
            out["recall"] = self._recall(observations[:1])
        if want.get("learning"):
            report = life.brain.last_learning
            out["learning"] = {
                name: round(float(report[name]), 5)
                for name in ("dopamine", "td_error", "value", "capped", "saturation", "trace")
                if name in report
            }
        return out

    def op_probe(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        return {"answers": self.life.probe(message["obs"])}

    def _recall(self, observations: Any) -> dict[str, Any]:
        assert self.life is not None
        read = self.life.recall(observations)
        return {
            store: {name: [[round(float(v), 4) for v in row] for row in values] for name, values in parts.items()}
            for store, parts in read.items()
        }

    @staticmethod
    def _frames(records: list[Any], limit: int) -> list[dict[str, Any]]:
        """The settling steps this tick actually ran, for the first stream: the free answer
        first, then any teaching or reward phase. Steps are thinned evenly to ``limit`` in all."""
        phases = []
        for record in records:
            activation = np.asarray(record.activation)[:, 0, :]
            kind = "free" if record.nudge is None else "nudged"
            if len(activation) > 1:
                phases.append((kind, activation))
        total = sum(len(a) for _, a in phases)
        out = []
        for kind, activation in phases:
            keep = max(2, round(limit * len(activation) / max(1, total)))
            index = np.unique(np.linspace(0, len(activation) - 1, keep).round().astype(int))
            level = np.clip((activation[index] + 0.1) / 1.1, 0.0, 1.0)
            out.append({"kind": kind, "steps": int(len(activation) - 1), "shown": int(len(index)),
                        "data": _b64((level * 255).astype(np.uint8))})
        return out

    def op_recall(self, message: dict[str, Any]) -> dict[str, Any]:
        return self._recall(message["obs"])

    def op_genes(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        return {"genes": self.life.set_genes(dict(message["genes"])).to_dict()}

    def op_fresh_stores(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        self.life.fresh_stores(message.get("genes"))
        return {"genes": self.life.genes.to_dict()}

    def op_sleep(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        return {"held": self.life.sleep()}

    def op_calibrate(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        return {"dentate": self.life.calibrate(np.asarray(message["obs"], dtype=float))}

    def op_atlas(self, message: dict[str, Any]) -> dict[str, Any]:
        """The layout of this brain for the standard brain view: every sense and region named."""
        from .atlas import build_atlas

        assert self.life is not None and self.spec is not None
        brain = self.life.brain
        populations = brain.connectome.populations
        regions: dict[str, Any] = {}
        roles: dict[str, str] = {}
        at = 0
        groups: dict[str, list[int]] = {}
        for sense in self.spec["senses"]:
            groups.setdefault(SENSE_ORGANS[sense["area"]], []).extend(range(at, at + sense["size"]))
            at += sense["size"]
        first = int(np.asarray(populations["sensory"])[0])
        for name, members in groups.items():
            regions[name], roles[name] = first + np.asarray(members), "sensory"
        for name, (label, role) in REGION_NAMES.items():
            if name in populations:
                regions[label], roles[label] = np.asarray(populations[name]), role
        atlas = build_atlas(brain.connectome, np.asarray(brain.brain.weights), regions=regions, roles=roles, seed=0)
        return {"atlas": atlas.subsample_edges(int(message.get("lines", 14000))).to_dict(),
                "neurons": int(brain.connectome.n), "synapses": int(brain.connectome.synapses)}

    def op_report(self, message: dict[str, Any]) -> dict[str, Any]:
        assert self.life is not None
        return {"report": self.life.report()}


def serve() -> None:
    """JSON lines on stdin, JSON lines on stdout. Warnings and tracebacks stay on stderr."""
    host = Host()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        sys.stdout.write(host.handle_json(line))
        sys.stdout.write("\n")
        sys.stdout.flush()


if __name__ == "__main__":
    import warnings

    warnings.simplefilter("ignore")
    serve()
