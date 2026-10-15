"""Parsing and validation of koralle.sim/v1 requests, and the top-level `run` function.

Request (JSON)::

    {
      "contract": "koralle.sim/v1",
      "label": "Magna Montage",
      "model": {"organization": "magna-meerane", "schemaVersion": "0.3.0"},
      "process": {
        "tasks": [{"id": "p-lack", "label": "Lackanlage", "time": 240, "variance": 0,
                   "capacity": 2, "failChance": 0.05, "split": "AND", "join": "AND",
                   "moduleId": "p-lack"}],
        "flows": [{"id": "e5", "source": "p-lack", "target": "p-qualitaet", "weight": 1}],
        "entry": ["p-we"], "exit": ["p-wa"]
      },
      "settings": {"parts": 200, "interarrival": 90, "replications": 10, "seed": 1},
      "scenarios": [{"id": "base", "label": "Basis", "overrides": []},
                    {"id": "s1", "label": "Stillstand Lack",
                     "overrides": [{"task": "p-lack", "downtimes": [{"start": 1800, "duration": 900}]}]}]
    }

Times are seconds.
"""

from __future__ import annotations

import math
import time
from collections import deque
from typing import Any

from .constants import (
    ARRIVAL_TYPES,
    CONTRACT,
    DEFAULT_JOIN,
    DEFAULT_SETTINGS,
    DEFAULT_SPLIT,
    END_ID,
    ENGINE_MODEL,
    ENGINE_NAME,
    ENGINE_VERSION,
    JOIN_TYPES,
    MAX_CAPACITY,
    MAX_EVENTS_TOTAL,
    MAX_PARTS,
    MAX_REPLICATIONS,
    MAX_SCENARIOS,
    MAX_TASKS,
    MAX_TIME,
    MAX_WEIGHT,
    MAX_WORK,
    SPLIT_TYPES,
    START_ID,
    TIME_SAMPLING,
    TIME_UNIT,
)
from .errors import ContractError, FieldError, LimitError
from .model import Downtime, Flow, Override, ProcessGraph, Scenario, Settings, SimulationRequest, Task
from .simulator import run_replications
from .stats import scenario_result

JsonDict = dict[str, Any]


class _Collector:
    def __init__(self) -> None:
        self.errors: list[FieldError] = []

    def add(self, path: str, message: str) -> None:
        self.errors.append(FieldError(path, message))

    def number(
        self,
        obj: JsonDict,
        key: str,
        path: str,
        *,
        default: float | None = None,
        minimum: float | None = None,
        maximum: float | None = None,
        required: bool = False,
        exclusive_min: bool = False,
    ) -> float | None:
        value = obj.get(key)
        if value is None:
            if required:
                self.add(f"{path}.{key}", "fehlt")
            return default
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            self.add(f"{path}.{key}", "muss eine Zahl sein")
            return default
        try:
            finite = math.isfinite(value)
        except OverflowError:  # very large JSON integers
            finite = False
        if not finite:
            self.add(f"{path}.{key}", "muss eine endliche Zahl sein")
            return default
        if minimum is not None and (value < minimum or (exclusive_min and value <= minimum)):
            self.add(f"{path}.{key}", f"muss {'>' if exclusive_min else '≥'} {minimum:g} sein")
        if maximum is not None and value > maximum:
            self.add(f"{path}.{key}", f"muss ≤ {maximum:g} sein")
        return float(value)

    def integer(self, obj: JsonDict, key: str, path: str, **kw: Any) -> int | None:
        value = self.number(obj, key, path, **kw)
        if value is None:
            return None
        if not float(value).is_integer():
            self.add(f"{path}.{key}", "muss eine ganze Zahl sein")
        return int(value)

    def choice(self, obj: JsonDict, key: str, path: str, options: tuple[str, ...], default: str) -> str:
        value = obj.get(key)
        if value is None or value == "":
            return default
        if not isinstance(value, str) or value.upper() not in [o.upper() for o in options]:
            self.add(f"{path}.{key}", f"erlaubt: {', '.join(options)}")
            return default
        return next(o for o in options if o.upper() == value.upper())

    def string(self, obj: JsonDict, key: str, path: str, *, required: bool = False) -> str | None:
        value = obj.get(key)
        if value is None:
            if required:
                self.add(f"{path}.{key}", "fehlt")
            return None
        if not isinstance(value, str) or (required and value.strip() == ""):
            self.add(f"{path}.{key}", "muss ein nicht-leerer Text sein")
            return None
        return value


def _downtimes(c: _Collector, raw: Any, path: str) -> tuple[Downtime, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list):
        c.add(path, "muss eine Liste sein")
        return ()
    out = []
    for i, d in enumerate(raw):
        p = f"{path}[{i}]"
        if not isinstance(d, dict):
            c.add(p, "muss ein Objekt sein")
            continue
        start = c.number(d, "start", p, minimum=0, maximum=MAX_TIME, required=True)
        duration = c.number(d, "duration", p, minimum=0, maximum=MAX_TIME, required=True, exclusive_min=True)
        if start is not None and duration is not None:
            out.append(Downtime(start, duration))
    return tuple(sorted(out, key=lambda d: d.start))


def parse_process(raw: Any, c: _Collector | None = None) -> ProcessGraph:
    """Validates the `process` part. Raises ContractError if called without a collector."""
    own = c is None
    c = c or _Collector()
    path = "process"
    if not isinstance(raw, dict):
        c.add(path, "fehlt oder ist kein Objekt")
        raise ContractError("Ungültige Anfrage", c.errors)

    tasks: dict[str, Task] = {}
    raw_tasks = raw.get("tasks")
    if not isinstance(raw_tasks, list) or not raw_tasks:
        c.add(f"{path}.tasks", "muss eine nicht-leere Liste sein")
        raw_tasks = []
    if len(raw_tasks) > MAX_TASKS:
        c.add(f"{path}.tasks", f"höchstens {MAX_TASKS} Prozessschritte")
    for i, t in enumerate(raw_tasks):
        p = f"{path}.tasks[{i}]"
        if not isinstance(t, dict):
            c.add(p, "muss ein Objekt sein")
            continue
        tid = c.string(t, "id", p, required=True)
        if tid is None:
            continue
        if tid in tasks or tid in (START_ID, END_ID):
            c.add(f"{p}.id", f"„{tid}“ ist doppelt oder reserviert")
            continue
        label = c.string(t, "label", p) or tid
        time_ = c.number(t, "time", p, minimum=0, maximum=MAX_TIME, required=True) or 0.0
        variance = c.number(t, "variance", p, minimum=0, maximum=MAX_TIME**2, default=0.0) or 0.0
        capacity = c.integer(t, "capacity", p, minimum=1, maximum=MAX_CAPACITY, default=1) or 1
        fail = c.number(t, "failChance", p, minimum=0, maximum=0.99, default=0.0) or 0.0
        split = c.choice(t, "split", p, SPLIT_TYPES, DEFAULT_SPLIT)
        join = c.choice(t, "join", p, JOIN_TYPES, DEFAULT_JOIN)
        module_id = c.string(t, "moduleId", p)
        tasks[tid] = Task(
            id=tid,
            label=label,
            time=time_,
            variance=variance,
            capacity=capacity,
            fail_chance=fail,
            split="XOR" if split == "OR" else split,
            join=join,
            module_id=module_id,
            downtimes=_downtimes(c, t.get("downtimes"), f"{p}.downtimes"),
        )

    flows: list[Flow] = []
    seen_flows: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    raw_flows = raw.get("flows", [])
    if not isinstance(raw_flows, list):
        c.add(f"{path}.flows", "muss eine Liste sein")
        raw_flows = []
    for i, f in enumerate(raw_flows):
        p = f"{path}.flows[{i}]"
        if not isinstance(f, dict):
            c.add(p, "muss ein Objekt sein")
            continue
        src = c.string(f, "source", p, required=True)
        tgt = c.string(f, "target", p, required=True)
        fid = c.string(f, "id", p) or f"{src}>{tgt}"
        if fid in seen_flows:
            c.add(f"{p}.id", f"„{fid}“ ist doppelt")
            continue
        seen_flows.add(fid)
        weight = c.number(f, "weight", p, minimum=0, maximum=MAX_WEIGHT)
        for key, ref in (("source", src), ("target", tgt)):
            if ref is not None and ref not in tasks:
                c.add(f"{p}.{key}", f"unbekannter Prozessschritt „{ref}“")
        if src is not None and tgt is not None and src in tasks and tgt in tasks:
            if src == tgt:
                c.add(p, "Schleife auf denselben Schritt")
            elif (src, tgt) in seen_pairs:
                c.add(p, f"doppelter Fluss {src} → {tgt}")
            else:
                seen_pairs.add((src, tgt))
                flows.append(Flow(fid, src, tgt, weight))

    has_in = {f.target for f in flows}
    has_out = {f.source for f in flows}

    def refs(key: str, default: list[str]) -> tuple[str, ...]:
        value = raw.get(key)
        if value is None:
            return tuple(default)
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            c.add(f"{path}.{key}", "muss eine Liste von Ids sein")
            return tuple(default)
        for v in value:
            if v not in tasks:
                c.add(f"{path}.{key}", f"unbekannter Prozessschritt „{v}“")
        return tuple(dict.fromkeys(v for v in value if v in tasks))

    entry = refs("entry", [t for t in tasks if t not in has_in])
    exit_ = refs("exit", [t for t in tasks if t not in has_out])
    if tasks and not entry:
        c.add(f"{path}.entry", "kein Startschritt (jeder Schritt hat einen Vorgänger)")
    if tasks and not exit_:
        c.add(f"{path}.exit", "kein Endschritt (jeder Schritt hat einen Nachfolger)")
    entry_split = c.choice(raw, "entrySplit", path, SPLIT_TYPES, "AND")

    if own and c.errors:
        raise ContractError("Ungültiger Prozess", c.errors)
    return ProcessGraph(tasks, tuple(flows), entry, exit_, "XOR" if entry_split == "OR" else entry_split)


def parse_settings(raw: Any, c: _Collector) -> Settings:
    raw = raw if isinstance(raw, dict) else {}
    d = DEFAULT_SETTINGS
    p = "settings"
    parts = c.integer(raw, "parts", p, minimum=1, maximum=MAX_PARTS, default=d["parts"])
    inter = c.number(raw, "interarrival", p, minimum=0, maximum=MAX_TIME, exclusive_min=True, default=d["interarrival"])
    reps = c.integer(raw, "replications", p, minimum=1, maximum=MAX_REPLICATIONS, default=d["replications"])
    seed = c.integer(raw, "seed", p, minimum=-(2**53), maximum=2**53, default=d["seed"])
    max_t = c.number(raw, "maxSimTime", p, minimum=0, maximum=MAX_TIME, exclusive_min=True)
    log = raw.get("eventLog", d["eventLog"])
    if not isinstance(log, bool):
        c.add(f"{p}.eventLog", "muss true oder false sein")
        log = False
    return Settings(
        parts=parts or 1,
        interarrival=inter or 1.0,
        arrival=c.choice(raw, "arrival", p, ARRIVAL_TYPES, str(d["arrival"])),
        replications=reps or 1,
        seed=seed if seed is not None else 1,
        time_sampling=c.choice(raw, "timeSampling", p, TIME_SAMPLING, str(d["timeSampling"])),
        max_sim_time=max_t,
        event_log=log,
    )


def parse_scenarios(raw: Any, graph: ProcessGraph, c: _Collector) -> tuple[Scenario, ...]:
    if raw is None:
        return (Scenario("base", "Basis"),)
    if not isinstance(raw, list) or not raw:
        c.add("scenarios", "muss eine nicht-leere Liste sein")
        return (Scenario("base", "Basis"),)
    if len(raw) > MAX_SCENARIOS:
        c.add("scenarios", f"höchstens {MAX_SCENARIOS} Szenarien")
    out: list[Scenario] = []
    ids: set[str] = set()
    for i, s in enumerate(raw):
        p = f"scenarios[{i}]"
        if not isinstance(s, dict):
            c.add(p, "muss ein Objekt sein")
            continue
        sid = c.string(s, "id", p) or f"s{i}"
        if sid in ids:
            c.add(f"{p}.id", f"„{sid}“ ist doppelt")
        ids.add(sid)
        overrides = []
        raw_o = s.get("overrides", [])
        if not isinstance(raw_o, list):
            c.add(f"{p}.overrides", "muss eine Liste sein")
            raw_o = []
        for j, o in enumerate(raw_o):
            op = f"{p}.overrides[{j}]"
            if not isinstance(o, dict):
                c.add(op, "muss ein Objekt sein")
                continue
            task = c.string(o, "task", op, required=True)
            if task is not None and task not in graph.tasks:
                c.add(f"{op}.task", f"unbekannter Prozessschritt „{task}“")
                continue
            if task is None:
                continue
            split = o.get("split")
            overrides.append(
                Override(
                    task=task,
                    time=c.number(o, "time", op, minimum=0, maximum=MAX_TIME),
                    variance=c.number(o, "variance", op, minimum=0, maximum=MAX_TIME**2),
                    capacity=c.integer(o, "capacity", op, minimum=1, maximum=MAX_CAPACITY),
                    fail_chance=c.number(o, "failChance", op, minimum=0, maximum=0.99),
                    split=None if split is None else _xor(c.choice(o, "split", op, SPLIT_TYPES, DEFAULT_SPLIT)),
                    downtimes=_downtimes(c, o.get("downtimes"), f"{op}.downtimes"),
                )
            )
        out.append(Scenario(sid, c.string(s, "label", p) or sid, tuple(overrides)))
    return tuple(out)


def _xor(split: str) -> str:
    """bpmn-graph-sim treats OR like XOR."""
    return "XOR" if split == "OR" else split


def estimated_work(graph: ProcessGraph, settings: Settings, scenarios: tuple[Scenario, ...]) -> float:
    """Part steps of a request; a step with fail chance p is processed 1/(1 − p) times on average."""
    total = 0.0
    for scenario in scenarios:
        g = scenario.apply(graph)
        total += sum(1.0 / (1.0 - t.fail_chance) for t in g.tasks.values()) or 1.0
    return total * settings.parts * settings.replications


def parse_request(payload: Any) -> SimulationRequest:
    """Validates a request. Raises ContractError with all problems found."""
    c = _Collector()
    if not isinstance(payload, dict):
        raise ContractError("Die Anfrage muss ein JSON-Objekt sein")
    contract = payload.get("contract", CONTRACT)
    if contract != CONTRACT:
        c.add("contract", f"erwartet „{CONTRACT}“")
    graph = parse_process(payload.get("process"), c)
    settings = parse_settings(payload.get("settings"), c)
    scenarios = parse_scenarios(payload.get("scenarios"), graph, c)
    if c.errors:
        raise ContractError("Ungültige Anfrage", c.errors)
    work = estimated_work(graph, settings, scenarios)
    if work > MAX_WORK:
        raise LimitError(
            f"Die Anfrage ist zu groß für einen direkten Lauf ({work:,.0f} > {MAX_WORK:,} Teil-Schritte). "
            "Weniger Teile, Wiederholungen oder Szenarien wählen."
        )
    model_ref = payload.get("model") if isinstance(payload.get("model"), dict) else {}
    label = payload.get("label") if isinstance(payload.get("label"), str) else ""
    return SimulationRequest(graph, settings, scenarios, label=label, model_ref=model_ref)


def _structure_warnings(graph: ProcessGraph) -> list[str]:
    """Tasks that no part can reach, or from which no part reaches the end."""
    succ: dict[str, list[str]] = {t: [] for t in graph.tasks}
    pred: dict[str, list[str]] = {t: [] for t in graph.tasks}
    for f in graph.flows:
        succ[f.source].append(f.target)
        pred[f.target].append(f.source)

    def reach(starts: tuple[str, ...], nxt: dict[str, list[str]]) -> set[str]:
        seen = set(starts)
        q = deque(starts)
        while q:
            for n in nxt[q.popleft()]:
                if n not in seen:
                    seen.add(n)
                    q.append(n)
        return seen

    warnings = []
    unreachable = [graph.tasks[t].label for t in graph.tasks if t not in reach(graph.entry, succ)]
    if unreachable:
        warnings.append("Nicht erreichbar: " + ", ".join(unreachable))
    dead = [graph.tasks[t].label for t in graph.tasks if t not in reach(graph.exit, pred)]
    if dead:
        warnings.append("Führt nicht zum Ende: " + ", ".join(dead))
    return warnings


def engine_info() -> JsonDict:
    return {
        "name": ENGINE_NAME,
        "version": ENGINE_VERSION,
        "model": ENGINE_MODEL,
        "contract": CONTRACT,
        "timeUnit": TIME_UNIT,
    }


def settings_dict(s: Settings) -> JsonDict:
    return {
        "parts": s.parts,
        "interarrival": s.interarrival,
        "arrival": s.arrival,
        "replications": s.replications,
        "seed": s.seed,
        "timeSampling": s.time_sampling,
        "maxSimTime": s.max_sim_time,
        "eventLog": s.event_log,
    }


def run(payload: Any) -> JsonDict:
    """Validates and runs a koralle.sim/v1 request. Returns the result document."""
    started = time.perf_counter()
    request = parse_request(payload)
    scenarios = []
    # One event budget for the whole request, split evenly; stops loops that would run for hours.
    budget = max(1, MAX_EVENTS_TOTAL // (request.settings.replications * len(request.scenarios)))
    for scenario in request.scenarios:
        graph = scenario.apply(request.graph)
        # Common random numbers: every scenario uses the same seeds, so differences come from the change.
        reps = run_replications(graph, request.settings, max_events=budget)
        scenarios.append(scenario_result(graph, reps, scenario.id, scenario.label))
    return {
        "contract": CONTRACT,
        "engine": engine_info(),
        "label": request.label,
        "model": request.model_ref,
        "timeUnit": TIME_UNIT,
        "settings": settings_dict(request.settings),
        "scenarios": scenarios,
        "warnings": _structure_warnings(request.graph),
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }
