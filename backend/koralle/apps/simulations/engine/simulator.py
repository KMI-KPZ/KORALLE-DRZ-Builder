"""Event-driven discrete simulation of a process graph.

The task model follows KORALLE-bpmn-graph-sim:

* every task has a mean time, a variance, a capacity and a fail chance;
* a part that finishes a task stays on it (and keeps the slot) until every
  successor it moves to has a free slot ("blocking after service"), so
  congestion travels upstream as back-pressure (Rückstau);
* a failed attempt restarts the task (rework);
* AND splits send the part to all successors, XOR/OR to one of them.

Differences to bpmn-graph-sim, chosen on purpose:

* events instead of fixed time steps (the improvement its README suggests),
  so run time no longer grows with the simulated time span;
* processing times are drawn per part and attempt, not once per run
  (``timeSampling="perRun"`` restores the original behaviour);
* parts arrive with the configured interval (bpmn-graph-sim starts all
  processes at once);
* AND joins wait until a part arrived on every incoming flow;
* tasks can have downtimes (Stillstand) for what-if scenarios.
"""

from __future__ import annotations

import heapq
import math
import random
from collections import defaultdict, deque
from dataclasses import dataclass, field

from .constants import END_ID, MAX_EVENT_LOG, MAX_EVENTS_TOTAL, MAX_TOKENS_PER_PART, START_ID
from .model import Downtime, ProcessGraph, Settings

_WAITING = 0
_BLOCKED = 1
_DONE = 2

_ARRIVE = 0
_FINISH = 1
_DOWN_END = 2


@dataclass
class _Node:
    id: str
    capacity: float
    time: float
    variance: float
    fail_chance: float
    split: str
    join: str
    downtimes: tuple[Downtime, ...]
    successors: list[tuple[str, str, float]] = field(default_factory=list)  # (flow id, target, weight)
    in_flows: list[str] = field(default_factory=list)  # ids of incoming flows (an AND join waits for each)
    occupied: int = 0
    fixed_time: float | None = None
    # finished parts waiting here for their successors (dict keeps insertion order → reproducible)
    blocked: dict[_Token, None] = field(default_factory=dict)

    @property
    def is_virtual(self) -> bool:
        return self.id in (START_ID, END_ID)

    @property
    def is_buffer(self) -> bool:
        """A step without processing time: waiting in it is storage, not blocking."""
        return self.time <= 0 and self.variance <= 0

    def needs_join(self) -> bool:
        return self.join == "AND" and len(self.in_flows) > 1

    def down_at(self, t: float) -> bool:
        if not self.downtimes:
            return False
        for d in self.downtimes:
            if d.start <= t < d.end:
                return True
            if d.start > t:
                break
        return False

    def finish_time(self, start: float, work: float) -> float:
        """Finish time of `work` seconds started at `start`, pausing during downtimes."""
        t = start
        remaining = work
        for d in self.downtimes:
            if d.end <= t:
                continue
            if d.start >= t + remaining:
                break
            if d.start > t:
                remaining -= d.start - t
            t = d.end
        return t + remaining


class _Part:
    __slots__ = ("id", "arrival", "alive", "created", "completed_at", "stuck", "joins", "entered_at")

    def __init__(self, part_id: int, arrival: float) -> None:
        self.id = part_id
        self.arrival = arrival
        self.alive = 1
        self.created = 1
        self.completed_at: float | None = None
        self.stuck: str | None = None
        self.joins: dict[str, dict[str, int]] = {}  # AND join → arrivals per incoming flow
        self.entered_at: float | None = None


class _Token:
    __slots__ = ("part", "node", "state", "targets", "full", "roots", "since", "started", "work")

    def __init__(self, part: _Part, node: str) -> None:
        self.part = part
        self.node = node
        self.state = _WAITING
        self.targets: list[tuple[str, str]] = []  # (flow id, target)
        self.full: list[tuple[str, str]] = []
        self.roots: list[str] = []
        self.since = 0.0
        self.started = 0.0
        self.work = 0.0


@dataclass
class ReplicationStats:
    horizon: float = 0.0
    completed: int = 0
    stuck: int = 0
    incomplete: int = 0
    lead_times: list[float] = field(default_factory=list)
    entry_waits: list[float] = field(default_factory=list)
    first_completion: float | None = None
    last_completion: float | None = None
    busy: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    blocked: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    buffered: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    blocking_caused: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    flow_blocked: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    processed: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    failures: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    dead_ends: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    join_waiting: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    deadlocked: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    max_occupied: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    events: int = 0
    stopped: str | None = None  # "time" or "budget" if the run did not end by itself
    warnings: list[str] = field(default_factory=list)
    log: list[dict[str, object]] = field(default_factory=list)


class Replication:
    """One simulation run with its own random stream."""

    def __init__(
        self, graph: ProcessGraph, settings: Settings, rng: random.Random, log: bool, max_events: int = MAX_EVENTS_TOTAL
    ) -> None:
        self.settings = settings
        self.max_events = max_events
        self.last_activity = 0.0
        self.rng = rng
        self.log_enabled = log
        self.stats = ReplicationStats()
        self.nodes: dict[str, _Node] = {}
        self.waiting: dict[str, deque[_Token]] = defaultdict(deque)
        self.heap: list[tuple[float, int, int, object]] = []
        self.seq = 0
        self.now = 0.0
        self.parts: list[_Part] = []
        self._build(graph)

    # ── setup ────────────────────────────────────────────────────────

    def _build(self, graph: ProcessGraph) -> None:
        inf = math.inf
        self.nodes[START_ID] = _Node(START_ID, inf, 0.0, 0.0, 0.0, graph.entry_split, "XOR", ())
        self.nodes[END_ID] = _Node(END_ID, inf, 0.0, 0.0, 0.0, "AND", "XOR", ())
        for t in graph.tasks.values():
            self.nodes[t.id] = _Node(
                t.id, float(t.capacity), t.time, t.variance, t.fail_chance, t.split, t.join, t.downtimes
            )
        for f in graph.flows:
            self.nodes[f.source].successors.append((f.id, f.target, 1.0 if f.weight is None else f.weight))
            self.nodes[f.target].in_flows.append(f.id)
        for task_id in dict.fromkeys(graph.entry):
            fid = f"{START_ID}>{task_id}"
            self.nodes[START_ID].successors.append((fid, task_id, 1.0))
            self.nodes[task_id].in_flows.append(fid)
        for task_id in dict.fromkeys(graph.exit):
            fid = f"{task_id}>{END_ID}"
            self.nodes[task_id].successors.append((fid, END_ID, 1.0))
            self.nodes[END_ID].in_flows.append(fid)
        if self.settings.time_sampling == "perRun":
            for n in self.nodes.values():
                if not n.is_virtual:
                    n.fixed_time = self._draw(n.time, n.variance)

    # ── helpers ──────────────────────────────────────────────────────

    def _push(self, t: float, kind: int, payload: object) -> None:
        self.seq += 1
        heapq.heappush(self.heap, (t, self.seq, kind, payload))

    def _draw(self, mean: float, variance: float) -> float:
        if variance <= 0:
            return max(0.0, mean)
        return max(0.0, self.rng.gauss(mean, math.sqrt(variance)))

    def _duration(self, node: _Node) -> float:
        if node.fixed_time is not None:
            return node.fixed_time
        return self._draw(node.time, node.variance)

    def _log(self, part: _Part, node: str, event: str) -> None:
        if not self.log_enabled:
            return
        if len(self.stats.log) >= MAX_EVENT_LOG or node in (START_ID, END_ID):
            return
        self.stats.log.append({"t": round(self.now, 3), "part": part.id, "task": node, "event": event})

    def _choose(self, node: _Node) -> list[tuple[str, str]]:
        succ = node.successors
        if node.split == "AND" or len(succ) == 1:
            return [(fid, tgt) for fid, tgt, _ in succ]
        total = sum(w for _, _, w in succ)
        if total <= 0:
            fid, tgt, _ = self.rng.choice(succ)
            return [(fid, tgt)]
        r = self.rng.random() * total
        for fid, tgt, w in succ:
            r -= w
            if r < 0:
                return [(fid, tgt)]
        fid, tgt, _ = succ[-1]
        return [(fid, tgt)]

    def _slots_needed(self, targets: list[tuple[str, str]], part: _Part) -> dict[str, int]:
        """Slots a move needs per target. An arrival that does not complete an AND join needs none."""
        need: dict[str, int] = defaultdict(int)
        arrivals: dict[str, dict[str, int]] = {}
        for fid, tgt in targets:
            if tgt == END_ID:
                continue
            node = self.nodes[tgt]
            if node.needs_join():
                arrived = arrivals.setdefault(tgt, dict(part.joins.get(tgt, {})))
                arrived[fid] = arrived.get(fid, 0) + 1
                if all(arrived.get(f, 0) >= 1 for f in node.in_flows):
                    need[tgt] += 1
                    for f in node.in_flows:
                        arrived[f] -= 1
            else:
                need[tgt] += 1
        return need

    def _full_targets(self, targets: list[tuple[str, str]], part: _Part) -> list[tuple[str, str]]:
        """Targets of a move that cannot take the part now (stopped or not enough free slots)."""
        need = self._slots_needed(targets, part)
        full: set[str] = set()
        for tgt, k in need.items():
            node = self.nodes[tgt]
            if node.down_at(self.now) or node.occupied + k > node.capacity:
                full.add(tgt)
        return [(fid, tgt) for fid, tgt in targets if tgt in full]

    # ── movement ─────────────────────────────────────────────────────

    def _try_move(self, tok: _Token) -> bool:
        part = tok.part
        if self._full_targets(tok.targets, part):
            return False
        self._leave(tok)
        first = True
        for fid, tgt in tok.targets:
            if not first:
                part.alive += 1
                part.created += 1
                if part.created > MAX_TOKENS_PER_PART:
                    part.stuck = part.stuck or "zu viele parallele Zweige (UND-Schleife?)"
                    part.alive -= 1
                    continue
            first = False
            self._enter(part, tgt, fid)
        return True

    def _leave(self, tok: _Token) -> None:
        node = self.nodes[tok.node]
        if tok.state == _BLOCKED:
            waited = self.now - tok.since
            if tok.node == START_ID:
                # Waiting in front of the first step is reported separately (entry queue).
                self.stats.entry_waits.append(waited)
            else:
                node.blocked.pop(tok, None)
                for fid, _ in tok.full:
                    self.stats.flow_blocked[fid] += waited
                if node.is_buffer:
                    # Storage: a queue in a buffer is expected and not counted as blocking.
                    self.stats.buffered[tok.node] += waited
                else:
                    self.stats.blocked[tok.node] += waited
                    for root in tok.roots:
                        self.stats.blocking_caused[root] += waited
        elif tok.node == START_ID:
            self.stats.entry_waits.append(0.0)
        if tok.node == START_ID:
            tok.part.entered_at = self.now
        tok.state = _DONE
        if not node.is_virtual:
            node.occupied -= 1

    def _enter(self, part: _Part, target: str, flow: str) -> None:
        if target == END_ID:
            part.alive -= 1
            self._maybe_complete(part)
            return
        node = self.nodes[target]
        if node.needs_join():
            arrived = part.joins.setdefault(target, {})
            arrived[flow] = arrived.get(flow, 0) + 1
            if not all(arrived.get(f, 0) >= 1 for f in node.in_flows):
                return  # parked until the part arrived on every incoming flow
            for f in node.in_flows:
                arrived[f] -= 1
            part.alive -= len(node.in_flows) - 1
        tok = _Token(part, target)
        node.occupied += 1
        if node.occupied > self.stats.max_occupied[node.id]:
            self.stats.max_occupied[node.id] = node.occupied
        self._start(tok, node)

    def _start(self, tok: _Token, node: _Node) -> None:
        tok.started = self.now
        tok.work = self._duration(node)
        self._log(tok.part, node.id, "start")
        self._push(node.finish_time(self.now, tok.work), _FINISH, tok)

    def _block(self, tok: _Token) -> None:
        tok.state = _BLOCKED
        tok.since = self.now
        tok.full = self._full_targets(tok.targets, tok.part)
        tok.roots = list(dict.fromkeys(self._root_cause(tgt) for _, tgt in tok.full))
        for _, tgt in tok.targets:
            self.waiting[tgt].append(tok)
        if tok.node != START_ID:
            self.nodes[tok.node].blocked[tok] = None
        self._log(tok.part, tok.node, "blocked")

    def _root_cause(self, target: str) -> str:
        """Follows a chain of full steps downstream to the one that actually holds the parts up.

        A full step whose slots only hold finished, waiting parts is not the cause; the step those
        parts wait for is. The search stops at a step that is working, stopped (downtime) or not full.
        """
        seen: set[str] = set()
        node_id = target
        while node_id not in seen:
            seen.add(node_id)
            node = self.nodes[node_id]
            if node.is_virtual or node.down_at(self.now) or node.occupied < node.capacity:
                return node_id
            if node.occupied > len(node.blocked):
                return node_id
            waiting = next(iter(node.blocked), None)
            if waiting is None or not waiting.full:
                return node_id
            node_id = waiting.full[0][1]
        return target

    def _release(self, node_id: str) -> None:
        """A slot at `node_id` (or at a node it unblocked) became free: move waiting parts in FIFO order."""
        pending = deque([node_id])
        while pending:
            nid = pending.popleft()
            queue = self.waiting.get(nid)
            if not queue:
                continue
            node = self.nodes[nid]
            while True:
                while queue and queue[0].state != _BLOCKED:
                    queue.popleft()
                if not queue:
                    break
                moved: str | None = None
                for tok in queue:
                    if tok.state != _BLOCKED:
                        continue
                    # FIFO: if the oldest part that needs a slot here cannot get one, later ones cannot either.
                    if (node.occupied >= node.capacity or node.down_at(self.now)) and self._slots_needed(
                        tok.targets, tok.part
                    ).get(nid, 0) > 0:
                        break
                    src = tok.node
                    if self._try_move(tok):
                        moved = src
                        break
                if moved is None:
                    break
                pending.append(moved)

    def _maybe_complete(self, part: _Part) -> None:
        if part.alive > 0 or part.completed_at is not None:
            return
        part.completed_at = self.now
        if part.stuck:
            return
        s = self.stats
        s.completed += 1
        s.lead_times.append(self.now - part.arrival)
        if s.first_completion is None:
            s.first_completion = self.now
        s.last_completion = self.now

    # ── event handlers ───────────────────────────────────────────────

    def _on_arrive(self, part: _Part) -> None:
        tok = _Token(part, START_ID)
        tok.targets = self._choose(self.nodes[START_ID])
        if not self._try_move(tok):
            self._block(tok)

    def _on_finish(self, tok: _Token) -> None:
        node = self.nodes[tok.node]
        part = tok.part
        # Work time only: a pause during a downtime is not processing.
        self.stats.busy[node.id] += tok.work
        if node.fail_chance > 0 and self.rng.random() < node.fail_chance:
            self.stats.failures[node.id] += 1
            self._log(part, node.id, "failure")
            self._start(tok, node)
            return
        self.stats.processed[node.id] += 1
        self._log(part, node.id, "end")
        if not node.successors:
            # Dead end: the part cannot reach the end of the process (bpmn-graph-sim: "possibly stuck").
            self.stats.dead_ends[node.id] += 1
            part.stuck = part.stuck or f"endet in {node.id}"
            tok.state = _DONE
            node.occupied -= 1
            part.alive -= 1
            self._maybe_complete(part)
            self._release(node.id)
            return
        tok.targets = self._choose(node)
        if self._try_move(tok):
            self._release(node.id)
        else:
            self._block(tok)

    # ── run ──────────────────────────────────────────────────────────

    def run(self) -> ReplicationStats:
        s = self.settings
        t = 0.0
        # Downtime ends first: at equal times the waiting queue moves before a new arrival.
        for n in self.nodes.values():
            for d in n.downtimes:
                self._push(d.end, _DOWN_END, n.id)
        for i in range(s.parts):
            part = _Part(i, t)
            self.parts.append(part)
            self._push(t, _ARRIVE, part)
            t += s.interarrival if s.arrival == "fixed" else self.rng.expovariate(1.0 / s.interarrival)

        st = self.stats
        while self.heap:
            when, _, kind, payload = heapq.heappop(self.heap)
            if s.max_sim_time is not None and when > s.max_sim_time:
                if kind == _DOWN_END:
                    continue
                st.stopped = "time"
                break
            if st.events >= self.max_events:
                st.stopped = "budget"
                st.warnings.append(
                    "Abgebrochen: Rechenbudget erschöpft (Schleife mit hoher Rücklaufquote oder hohe Ausfallrate?). "
                    "Teile ohne Ende zählen als unvollständig."
                )
                break
            self.now = when
            st.events += 1
            if kind == _ARRIVE:
                self.last_activity = when
                self._on_arrive(payload)  # type: ignore[arg-type]
            elif kind == _FINISH:
                self.last_activity = when
                self._on_finish(payload)  # type: ignore[arg-type]
            else:
                self._release(payload)  # type: ignore[arg-type]

        # Time span the statistics refer to: until the last arrival or finished step (not a later downtime end).
        st.horizon = s.max_sim_time if st.stopped == "time" and s.max_sim_time is not None else self.last_activity
        if st.stopped is None:
            # Parts still blocked when nothing can happen any more: circular wait (e.g. a loop without buffer).
            for queue in self.waiting.values():
                for tok in queue:
                    if tok.state == _BLOCKED and tok.node != START_ID:
                        tok.state = _DONE
                        st.deadlocked[tok.node] += 1
        for part in self.parts:
            if part.completed_at is not None and not part.stuck:
                continue
            if part.stuck:
                st.stuck += 1
            elif st.stopped is not None:
                st.incomplete += 1
            else:
                st.stuck += 1
                for task_id, arrived in part.joins.items():
                    if any(c > 0 for c in arrived.values()):
                        st.join_waiting[task_id] += 1
        return st


def run_replications(
    graph: ProcessGraph, settings: Settings, max_events: int = MAX_EVENTS_TOTAL
) -> list[ReplicationStats]:
    """Runs all replications of one scenario. Replication i uses seed `settings.seed + i`.

    `max_events` is the budget per replication; the caller splits the overall budget.
    """
    results = []
    for i in range(settings.replications):
        rng = random.Random(settings.seed + i)
        results.append(
            Replication(graph, settings, rng, log=settings.event_log and i == 0, max_events=max_events).run()
        )
    return results
