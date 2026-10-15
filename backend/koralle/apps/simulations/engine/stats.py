"""Aggregation of replication results into the result shape of koralle.sim/v1."""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

from .constants import BOTTLENECK_LIMIT
from .model import ProcessGraph
from .simulator import ReplicationStats


def percentile(values: list[float], q: float) -> float:
    """Linear interpolation between closest ranks (like numpy's default)."""
    if not values:
        return 0.0
    data = sorted(values)
    if len(data) == 1:
        return data[0]
    pos = (len(data) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return data[lo]
    return data[lo] + (data[hi] - data[lo]) * (pos - lo)


def summary(values: Iterable[float]) -> dict[str, float]:
    data = [float(v) for v in values]
    if not data:
        return {"mean": 0.0, "std": 0.0, "min": 0.0, "max": 0.0, "p05": 0.0, "p95": 0.0}
    mean = sum(data) / len(data)
    var = sum((v - mean) ** 2 for v in data) / (len(data) - 1) if len(data) > 1 else 0.0
    return {
        "mean": _r(mean),
        "std": _r(math.sqrt(var)),
        "min": _r(min(data)),
        "max": _r(max(data)),
        "p05": _r(percentile(data, 0.05)),
        "p95": _r(percentile(data, 0.95)),
    }


def _r(v: float) -> float:
    return round(v, 4)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def throughput_per_hour(rep: ReplicationStats) -> float:
    """Output rate between the first and the last completed part (steady state, without the ramp-up)."""
    if rep.completed < 2 or rep.first_completion is None or rep.last_completion is None:
        return 0.0
    span = rep.last_completion - rep.first_completion
    if span <= 0:
        return 0.0
    return (rep.completed - 1) / span * 3600.0


TIE = 0.01  # utilization difference below which steps count as equally loaded


def _bottlenecks(tasks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """The bottleneck is the step that works most of the time (utilization of its slots).

    If several steps are equally loaded, the back-pressure they cause upstream decides. A balanced
    line has no single bottleneck; it is reported as a note instead of picking one at random.
    """
    working = [t for t in tasks if float(t["utilization"]) > 0]
    if not working:
        return [], []
    total_caused = sum(float(t["blockingCaused"]) for t in tasks)
    top = max(float(t["utilization"]) for t in working)
    ties = sorted(
        (t for t in working if float(t["utilization"]) >= top - TIE),
        key=lambda t: float(t["blockingCaused"]),
        reverse=True,
    )
    notes: list[str] = []
    if len(ties) > 1:
        first, second = float(ties[0]["blockingCaused"]), float(ties[1]["blockingCaused"])
        if first <= 0 or first < second * 1.1:
            names = ", ".join(str(t["label"]) for t in ties[:4]) + (" …" if len(ties) > 4 else "")
            notes.append(
                f"Ausgeglichen: {len(ties)} Schritte gleich ausgelastet ({round(top * 100)} %), "
                f"kein einzelner Engpass ({names})."
            )
            return [], notes
    # Further candidates: steps that also hold others up; without any blocking, the next most utilized.
    others = [t for t in working if t is not ties[0]]
    if total_caused > 0:
        others = [t for t in others if float(t["blockingCaused"]) > 0]
    rest = sorted(others, key=lambda t: (float(t["utilization"]), float(t["blockingCaused"])), reverse=True)
    out = []
    for t in [ties[0], *rest][:BOTTLENECK_LIMIT]:
        util = float(t["utilization"])
        caused = float(t["blockingCaused"])
        share = caused / total_caused if total_caused > 0 else 0.0
        reason = f"Auslastung {round(util * 100)} %"
        if share > 0:
            reason += f", verursacht {round(share * 100)} % der Blockierzeit vorgelagerter Schritte"
        out.append(
            {
                "task": t["id"],
                "moduleId": t["moduleId"],
                "utilization": util,
                "blockingShare": _r(share),
                "reason": reason,
            }
        )
    return out, notes


def scenario_result(
    graph: ProcessGraph, reps: list[ReplicationStats], scenario_id: str, label: str
) -> dict[str, object]:
    n = len(reps)
    kpis = {
        "throughputPerHour": summary(throughput_per_hour(r) for r in reps),
        # Replications without a finished part have no lead time; they must not count as 0.
        "leadTime": summary(_mean(r.lead_times) for r in reps if r.lead_times),
        "leadTimeP95": summary(percentile(r.lead_times, 0.95) for r in reps if r.lead_times),
        "makespan": summary(r.horizon for r in reps),
        "completed": summary(r.completed for r in reps),
        "stuck": summary(r.stuck for r in reps),
        "incomplete": summary(r.incomplete for r in reps),
        "failures": summary(sum(r.failures.values()) for r in reps),
        "blockedTime": summary(sum(r.blocked.values()) for r in reps),
        "bufferTime": summary(sum(r.buffered.values()) for r in reps),
        "entryWait": summary(_mean(r.entry_waits) for r in reps),
        "wip": summary((sum(r.lead_times) / r.horizon) if r.horizon > 0 else 0.0 for r in reps),
    }

    tasks = []
    for task in graph.tasks.values():
        tid = task.id
        cap = max(1, task.capacity)
        util = [(r.busy.get(tid, 0.0) / (cap * r.horizon)) if r.horizon > 0 else 0.0 for r in reps]
        blocked_share = [(r.blocked.get(tid, 0.0) / (cap * r.horizon)) if r.horizon > 0 else 0.0 for r in reps]
        failures = _mean([float(r.failures.get(tid, 0)) for r in reps])
        caused = _mean([r.blocking_caused.get(tid, 0.0) for r in reps])
        # bpmn-graph-sim: ((fails + 1) * Σ waiting on incoming edges + fails) / 100, here in seconds.
        legacy = ((failures + 1) * caused + failures) / 100.0
        tasks.append(
            {
                "id": tid,
                "moduleId": task.module_id,
                "label": task.label,
                "capacity": task.capacity,
                "utilization": _r(_mean(util)),
                "blockedShare": _r(_mean(blocked_share)),
                "processed": _r(_mean([float(r.processed.get(tid, 0)) for r in reps])),
                "failures": _r(failures),
                "busyTime": _r(_mean([r.busy.get(tid, 0.0) for r in reps])),
                "blockedTime": _r(_mean([r.blocked.get(tid, 0.0) for r in reps])),
                "bufferedTime": _r(_mean([r.buffered.get(tid, 0.0) for r in reps])),
                "blockingCaused": _r(caused),
                "downtime": _r(sum(d.duration for d in task.downtimes)),
                "deadEnds": _r(_mean([float(r.dead_ends.get(tid, 0)) for r in reps])),
                "joinWaiting": _r(_mean([float(r.join_waiting.get(tid, 0)) for r in reps])),
                "deadlocked": _r(_mean([float(r.deadlocked.get(tid, 0)) for r in reps])),
                "avgOccupied": _r(
                    _mean(
                        [
                            (r.busy.get(tid, 0.0) + r.blocked.get(tid, 0.0) + r.buffered.get(tid, 0.0)) / r.horizon
                            if r.horizon > 0
                            else 0.0
                            for r in reps
                        ]
                    )
                ),
                "maxOccupied": max((r.max_occupied.get(tid, 0) for r in reps), default=0),
                "bpmnGraphSimScore": _r(legacy),
            }
        )

    bottlenecks, notes = _bottlenecks(tasks)

    flow_ids = {f.id for f in graph.flows}
    flows = [
        {"id": fid, "blockedTime": _r(_mean([r.flow_blocked.get(fid, 0.0) for r in reps]))}
        for fid in sorted(flow_ids)
        if any(r.flow_blocked.get(fid, 0.0) > 0 for r in reps)
    ]

    warnings: list[str] = []
    for r in reps:
        for w in r.warnings:
            if w not in warnings:
                warnings.append(w)
    stuck_mean = kpis["stuck"]["mean"]
    if stuck_mean > 0:
        dead = [t["label"] for t in tasks if float(t["deadEnds"]) > 0]  # type: ignore[arg-type]
        joins = [t["label"] for t in tasks if float(t["joinWaiting"]) > 0]  # type: ignore[arg-type]
        detail = []
        if dead:
            detail.append("Sackgasse bei " + ", ".join(str(d) for d in dead))
        if joins:
            detail.append("wartet an UND-Zusammenführung bei " + ", ".join(str(j) for j in joins))
        locked = [t["label"] for t in tasks if float(t["deadlocked"]) > 0]  # type: ignore[arg-type]
        if locked:
            detail.append(
                "gegenseitige Blockade bei "
                + ", ".join(str(x) for x in locked)
                + " (Kreislauf ohne Puffer: Kapazität erhöhen oder Puffer einfügen)"
            )
        warnings.append(
            f"Im Mittel {stuck_mean:g} Teile kommen nicht am Ende an" + (f" ({'; '.join(detail)})." if detail else ".")
        )

    result: dict[str, object] = {
        "id": scenario_id,
        "label": label,
        "replications": n,
        "kpis": kpis,
        "tasks": tasks,
        "flows": flows,
        "bottlenecks": bottlenecks,
        "notes": notes,
        "warnings": warnings,
    }
    if reps and reps[0].log:
        result["eventLog"] = reps[0].log
    return result
