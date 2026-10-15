"""Small builders for test processes."""

from __future__ import annotations

from typing import Any


def chain(*times: float, capacity: int = 1, **task_extra: Any) -> dict[str, Any]:
    tasks = [
        {"id": f"t{i}", "label": f"T{i}", "time": t, "capacity": capacity, **task_extra} for i, t in enumerate(times)
    ]
    flows = [{"id": f"f{i}", "source": f"t{i}", "target": f"t{i + 1}"} for i in range(len(times) - 1)]
    return {"tasks": tasks, "flows": flows}


def request(process: dict[str, Any], scenarios: Any = None, **settings: Any) -> dict[str, Any]:
    base = {"parts": 20, "interarrival": 90, "replications": 1, "seed": 7}
    base.update(settings)
    payload: dict[str, Any] = {"contract": "koralle.sim/v1", "process": process, "settings": base}
    if scenarios is not None:
        payload["scenarios"] = scenarios
    return payload


def task(result: dict[str, Any], task_id: str, scenario: int = 0) -> dict[str, Any]:
    return next(t for t in result["scenarios"][scenario]["tasks"] if t["id"] == task_id)


def kpi(result: dict[str, Any], name: str, scenario: int = 0, stat: str = "mean") -> float:
    return float(result["scenarios"][scenario]["kpis"][name][stat])
