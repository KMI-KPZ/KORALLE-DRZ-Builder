"""Framework-free data model of a simulation run."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from .constants import DEFAULT_JOIN, DEFAULT_SPLIT


@dataclass(frozen=True)
class Downtime:
    """The task admits no new parts and pauses running work during [start, start + duration)."""

    start: float
    duration: float

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass(frozen=True)
class Task:
    """A process step. Mirrors a bpmn-graph-sim task: name; time; variance; capacity; fail_chance; gateway_type."""

    id: str
    label: str
    time: float
    variance: float = 0.0
    capacity: int = 1
    fail_chance: float = 0.0
    split: str = DEFAULT_SPLIT
    join: str = DEFAULT_JOIN
    module_id: str | None = None
    downtimes: tuple[Downtime, ...] = ()


@dataclass(frozen=True)
class Flow:
    id: str
    source: str
    target: str
    weight: float | None = None


@dataclass(frozen=True)
class ProcessGraph:
    tasks: dict[str, Task]
    flows: tuple[Flow, ...]
    entry: tuple[str, ...]
    exit: tuple[str, ...]
    entry_split: str = "AND"


@dataclass(frozen=True)
class Settings:
    parts: int
    interarrival: float
    arrival: str
    replications: int
    seed: int
    time_sampling: str
    max_sim_time: float | None
    event_log: bool


@dataclass(frozen=True)
class Override:
    task: str
    time: float | None = None
    variance: float | None = None
    capacity: int | None = None
    fail_chance: float | None = None
    split: str | None = None
    downtimes: tuple[Downtime, ...] = ()


@dataclass(frozen=True)
class Scenario:
    id: str
    label: str
    overrides: tuple[Override, ...] = ()

    def apply(self, graph: ProcessGraph) -> ProcessGraph:
        if not self.overrides:
            return graph
        tasks = dict(graph.tasks)
        for o in self.overrides:
            t = tasks[o.task]
            tasks[o.task] = replace(
                t,
                time=t.time if o.time is None else o.time,
                variance=t.variance if o.variance is None else o.variance,
                capacity=t.capacity if o.capacity is None else o.capacity,
                fail_chance=t.fail_chance if o.fail_chance is None else o.fail_chance,
                split=t.split if o.split is None else o.split,
                downtimes=tuple(sorted(t.downtimes + o.downtimes, key=lambda d: d.start)),
            )
        return replace(graph, tasks=tasks)


@dataclass(frozen=True)
class SimulationRequest:
    graph: ProcessGraph
    settings: Settings
    scenarios: tuple[Scenario, ...]
    label: str = ""
    model_ref: dict[str, object] = field(default_factory=dict)
