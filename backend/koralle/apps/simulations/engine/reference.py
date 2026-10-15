"""Runs the original KORALLE-bpmn-graph-sim on a koralle.sim/v1 process, for comparison.

The original needs numpy and is time-stepped, so it is not used for regular
runs. It stays useful as a reference while the event-driven engine is
validated, and for anyone who wants to check a result with the original code.

    python -m apps.simulations.engine.reference --sim ../KORALLE-bpmn-graph-sim path/to/model.bpmn --parts 5

The path to the repository can also be set with BPMN_GRAPH_SIM_PATH.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from .bpmn import read_bpmn, write_bpmn

ENV_PATH = "BPMN_GRAPH_SIM_PATH"


def available(path: str | None = None) -> Path | None:
    """Path of a usable bpmn-graph-sim checkout, or None."""
    raw = path or os.environ.get(ENV_PATH)
    if not raw:
        return None
    p = Path(raw).expanduser().resolve()
    if not (p / "graph_simulation.py").is_file():
        return None
    try:
        importlib.import_module("numpy")
    except ImportError:
        return None
    return p


def _load(path: Path) -> Any:
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
    return importlib.import_module("graph_simulation")


def run_reference(
    process: dict[str, Any],
    *,
    parts: int = 1,
    stagger: float = 0.0,
    time_step: float = 1.0,
    seed: int | None = None,
    path: str | None = None,
) -> dict[str, Any]:
    """Writes the process as BPMN in the bpmn-graph-sim format and runs the original simulation once."""
    repo = available(path)
    if repo is None:
        raise RuntimeError(f"KORALLE-bpmn-graph-sim nicht gefunden (Pfad über {ENV_PATH} setzen, numpy nötig).")
    gsim = _load(repo)
    if seed is not None:
        import random

        import numpy as np

        random.seed(seed)
        np.random.seed(seed)
    with tempfile.TemporaryDirectory() as tmp:
        file = Path(tmp) / "process.bpmn"
        file.write_text(write_bpmn(process), encoding="utf-8")
        sim = gsim.Simulation(str(file), n=parts, t=stagger, time_step_length=time_step)
        results = sim.simulate()
    by_name = {node.name: node_id for node_id, node in results.graph.nodes.items()}
    label_to_id = {str(t.get("label") or t["id"]).replace(";", ","): t["id"] for t in process["tasks"]}
    return {
        "simulationTime": results.time_steps_taken,
        "failures": {label_to_id.get(results.graph.nodes[k].name, k): v for k, v in results.fails.items() if v},
        "totalWaitingTime": sum(results.edge_times_spent_waiting.values()),
        "bottlenecks": [label_to_id.get(b["node"], b["node"]) for b in results.find_bottlenecks()[:3]],
        "possiblyStuck": sum(1 for p in results.processes_ran if p.possibly_stuck),
        "endTimes": [p.end_time for p in results.processes_ran],
        "nodes": len(by_name),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the original bpmn-graph-sim on a BPMN file.")
    parser.add_argument("bpmn", help="BPMN file (bpmn-graph-sim format)")
    parser.add_argument("--sim", help=f"path to KORALLE-bpmn-graph-sim (or set {ENV_PATH})")
    parser.add_argument("--parts", type=int, default=1)
    parser.add_argument("--stagger", type=float, default=0.0)
    parser.add_argument("--step", type=float, default=1.0)
    parser.add_argument("--seed", type=int)
    args = parser.parse_args(argv)
    process = read_bpmn(Path(args.bpmn).read_text(encoding="utf-8"))["process"]
    out = run_reference(
        process, parts=args.parts, stagger=args.stagger, time_step=args.step, seed=args.seed, path=args.sim
    )
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
