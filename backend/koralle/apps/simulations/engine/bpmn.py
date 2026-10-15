"""BPMN 2.0 import and export in the format of KORALLE-bpmn-graph-sim.

bpmn-graph-sim keeps the simulation parameters in the task name::

    name; time; variance; capacity; fail_chance; gateway_type

`read_bpmn` turns such a file (or a plain BPMN model) into the `process`
object of koralle.sim/v1. `write_bpmn` does the reverse, with diagram
information so that bpmn.io / Camunda Modeler can open the file, and so that
the original bpmn-graph-sim can run the same process.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from typing import Any
from xml.sax.saxutils import escape, quoteattr

from .errors import BpmnError

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"

# bpmn-graph-sim gives unnamed elements a practically unlimited capacity.
UNLIMITED = 1_000_000

_TASK_TAGS = {
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "scriptTask",
    "sendTask",
    "receiveTask",
    "businessRuleTask",
    "callActivity",
    "subProcess",
}
_PASS_THROUGH_TAGS = {"intermediateCatchEvent", "intermediateThrowEvent"}
_GATEWAYS = {
    "exclusiveGateway": ("XOR", "XOR"),
    "parallelGateway": ("AND", "AND"),
    "inclusiveGateway": ("XOR", "XOR"),
    "eventBasedGateway": ("XOR", "XOR"),
    "complexGateway": ("XOR", "XOR"),
}
_SIM_NAME = re.compile(r"^(?P<name>[^;]*);(?P<rest>.*)$")


def parse_sim_name(name: str) -> dict[str, Any] | None:
    """Parses "name; time; variance; capacity; fail_chance; gateway_type". None if the name has another form."""
    parts = [p.strip() for p in name.split(";")]
    if len(parts) != 6:
        return None
    label, time_, variance, capacity, fail, gateway = parts
    try:
        values = {
            "label": label,
            "time": float(time_),
            "variance": float(variance),
            "capacity": int(float(capacity)),
            "failChance": float(fail),
            "split": gateway.upper(),
        }
    except ValueError:
        return None
    if values["split"] not in ("AND", "XOR", "OR"):
        return None
    return values


def _local(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def read_bpmn(xml: str) -> dict[str, Any]:
    """Returns {"process": {...}, "warnings": [...], "name": str} for the first process in the document."""
    try:
        root = ET.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    except ET.ParseError as exc:
        raise BpmnError(f"Kein gültiges XML: {exc}") from exc
    if _local(root.tag) != "definitions":
        raise BpmnError("Kein BPMN-Dokument (Wurzelelement „definitions“ fehlt).")
    process = next((el for el in root if _local(el.tag) == "process"), None)
    if process is None:
        raise BpmnError("Das BPMN-Dokument enthält keinen Prozess.")

    warnings: list[str] = []
    tasks: dict[str, dict[str, Any]] = {}
    starts: set[str] = set()
    ends: set[str] = set()
    without_params: list[str] = []
    flows: list[tuple[str, str, str, float | None]] = []

    for el in process:
        tag = _local(el.tag)
        eid = el.get("id")
        if not eid:
            continue
        name = (el.get("name") or "").strip()
        if tag == "sequenceFlow":
            src, tgt = el.get("sourceRef"), el.get("targetRef")
            if src and tgt:
                weight = None
                m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", name)
                if m:
                    weight = float(m.group(1).replace(",", "."))
                flows.append((eid, src, tgt, weight))
            continue
        if tag == "startEvent":
            starts.add(eid)
            continue
        if tag == "endEvent":
            ends.add(eid)
            continue
        params = parse_sim_name(name) if name else None
        if tag in _GATEWAYS:
            split, join = _GATEWAYS[tag]
            if tag == "inclusiveGateway":
                warnings.append(f"Inklusives Gateway „{name or eid}“ wird wie XODER behandelt.")
            task = {"id": eid, "label": name or tag, "time": 0.0, "capacity": UNLIMITED, "split": split, "join": join}
            if params:
                task.update({k: v for k, v in params.items() if k not in ("split",)})
        elif tag in _TASK_TAGS or tag in _PASS_THROUGH_TAGS:
            if params:
                task = {"id": eid, "join": "XOR", **params}
            elif name and tag in _TASK_TAGS:
                task = {"id": eid, "label": name, "time": 0.0, "capacity": 1, "split": "AND", "join": "XOR"}
                without_params.append(name)
            else:
                task = {
                    "id": eid,
                    "label": name or tag,
                    "time": 0.0,
                    "capacity": UNLIMITED,
                    "split": "AND",
                    "join": "XOR",
                }
        else:
            continue
        if task.get("split") == "OR":
            task["split"] = "XOR"
        tasks[eid] = task

    if not starts:
        raise BpmnError("Der Prozess hat kein Startereignis.")
    if not ends:
        raise BpmnError("Der Prozess hat kein Endereignis.")

    entry: list[str] = []
    exit_: list[str] = []
    out_flows = []
    for fid, src, tgt, weight in flows:
        if src in starts and tgt in tasks:
            entry.append(tgt)
        elif tgt in ends and src in tasks:
            exit_.append(src)
        elif src in starts and tgt in ends:
            warnings.append("Direkte Verbindung Start → Ende ignoriert.")
        elif src in tasks and tgt in tasks:
            flow: dict[str, Any] = {"id": fid, "source": src, "target": tgt}
            if weight is not None:
                flow["weight"] = weight
            out_flows.append(flow)
    if without_params:
        warnings.append(
            "Ohne Simulationsparameter (Zeit 0, Kapazität 1): "
            + ", ".join(without_params[:10])
            + (" …" if len(without_params) > 10 else "")
        )
    return {
        "name": process.get("name") or process.get("id") or "",
        "process": {
            "tasks": list(tasks.values()),
            "flows": out_flows,
            "entry": sorted(set(entry), key=entry.index),
            "exit": sorted(set(exit_), key=exit_.index),
            "entrySplit": "AND",
        },
        "warnings": warnings,
    }


def _fmt(v: float) -> str:
    return f"{v:g}"


def _sim_name(task: dict[str, Any]) -> str:
    label = str(task.get("label") or task["id"]).replace(";", ",")
    return ";".join(
        [
            label,
            _fmt(float(task.get("time", 0))),
            _fmt(float(task.get("variance", 0) or 0)),
            str(int(task.get("capacity", 1) or 1)),
            _fmt(float(task.get("failChance", 0) or 0)),
            str(task.get("split", "AND") or "AND").upper(),
        ]
    )


def _xml_id(raw: str, used: set[str]) -> str:
    base = re.sub(r"[^A-Za-z0-9_.-]", "_", raw)
    if not base or not (base[0].isalpha() or base[0] == "_"):
        base = f"id_{base}"
    candidate = base
    i = 2
    while candidate in used:
        candidate = f"{base}_{i}"
        i += 1
    used.add(candidate)
    return candidate


def _levels(nodes: list[str], edges: list[tuple[str, str]], root: str) -> dict[str, int]:
    """Longest-path layer of every node; edges that close a loop are ignored."""
    succ: dict[str, list[str]] = defaultdict(list)
    for s, t in edges:
        succ[s].append(t)
    back: set[tuple[str, str]] = set()
    state: dict[str, int] = {}
    for origin in [root, *nodes]:
        if origin in state:
            continue
        stack = [(origin, iter(succ[origin]))]
        state[origin] = 1
        while stack:
            node, it = stack[-1]
            nxt = next(it, None)
            if nxt is None:
                state[node] = 2
                stack.pop()
            elif state.get(nxt) == 1:
                back.add((node, nxt))
            elif nxt not in state:
                state[nxt] = 1
                stack.append((nxt, iter(succ[nxt])))
    indeg: dict[str, int] = {n: 0 for n in nodes}
    for s, t in edges:
        if (s, t) not in back:
            indeg[t] = indeg.get(t, 0) + 1
    level = {n: 0 for n in nodes}
    queue = deque(n for n in nodes if indeg[n] == 0)
    while queue:
        n = queue.popleft()
        for m in succ[n]:
            if (n, m) in back:
                continue
            level[m] = max(level[m], level[n] + 1)
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
    return level


def write_bpmn(process: dict[str, Any], name: str = "KORALLE Prozesskette") -> str:
    """Writes a process (koralle.sim/v1 `process`) as BPMN 2.0 with diagram information."""
    tasks: list[dict[str, Any]] = list(process.get("tasks", []))
    flows: list[dict[str, Any]] = list(process.get("flows", []))
    ids = {t["id"] for t in tasks}
    has_in = {f["target"] for f in flows}
    has_out = {f["source"] for f in flows}
    entry = list(process.get("entry") or [t["id"] for t in tasks if t["id"] not in has_in])
    exit_ = list(process.get("exit") or [t["id"] for t in tasks if t["id"] not in has_out])

    used: set[str] = set()
    xid = {t["id"]: _xml_id(str(t["id"]), used) for t in tasks}
    start_id = _xml_id("StartEvent_1", used)
    end_id = _xml_id("EndEvent_1", used)
    proc_id = _xml_id("Process_koralle", used)

    # AND joins become a parallel gateway in front of the task (bpmn-graph-sim treats it as a zero-time step).
    incoming: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for f in flows:
        if f["source"] in ids and f["target"] in ids:
            incoming[f["target"]].append(f)
    join_gw: dict[str, str] = {}
    for t in tasks:
        if str(t.get("join", "AND")).upper() == "AND" and len(incoming[t["id"]]) > 1:
            join_gw[t["id"]] = _xml_id(f"Gateway_join_{t['id']}", used)

    edges: list[tuple[str, str, str, str]] = []  # (id, source xml id, target xml id, name)
    for tid in entry:
        if tid in ids:
            edges.append((_xml_id(f"Flow_start_{tid}", used), start_id, xid[tid], ""))
    for f in flows:
        if f["source"] not in ids or f["target"] not in ids:
            continue
        target = join_gw.get(f["target"], xid[f["target"]])
        label = f"{_fmt(float(f['weight']))} %" if f.get("weight") is not None else ""
        edges.append(
            (_xml_id(str(f.get("id") or f"Flow_{f['source']}_{f['target']}"), used), xid[f["source"]], target, label)
        )
    for tid, gw in join_gw.items():
        edges.append((_xml_id(f"Flow_join_{tid}", used), gw, xid[tid], ""))
    for tid in exit_:
        if tid in ids:
            edges.append((_xml_id(f"Flow_end_{tid}", used), xid[tid], end_id, ""))

    # Layered layout: longest path from the start after dropping back edges (loops).
    level = _levels([start_id, *xid.values(), *join_gw.values(), end_id], [(s, t) for _, s, t, _ in edges], start_id)
    level[end_id] = max(v for k, v in level.items() if k != end_id) + 1
    order = {n: i for i, n in enumerate([start_id, *xid.values(), *join_gw.values(), end_id])}

    rows: dict[int, int] = defaultdict(int)
    pos: dict[str, tuple[float, float, float, float]] = {}
    kinds: dict[str, str] = {start_id: "event", end_id: "event", **{g: "gateway" for g in join_gw.values()}}
    for n in sorted(level, key=lambda k: (level[k], order[k])):
        kind = kinds.get(n, "task")
        w, h = {"event": (36, 36), "gateway": (50, 50), "task": (120, 80)}[kind]
        lv = level[n]
        row = rows[lv]
        rows[lv] += 1
        cx = 120 + lv * 190
        cy = 140 + row * 130
        pos[n] = (cx - w / 2, cy - h / 2, w, h)

    def attr(v: str) -> str:
        return quoteattr(v)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<bpmn:definitions xmlns:bpmn="{BPMN_NS}" xmlns:bpmndi="{BPMNDI_NS}" xmlns:dc="{DC_NS}" xmlns:di="{DI_NS}" '
        'id="Definitions_koralle" targetNamespace="urn:koralle:bpmn" '
        'exporter="KORALLE koralle-sim" exporterVersion="0.1.0">',
        f'  <bpmn:process id={attr(proc_id)} name={attr(name)} isExecutable="false">',
    ]
    out_by: dict[str, list[str]] = defaultdict(list)
    in_by: dict[str, list[str]] = defaultdict(list)
    for eid, s, t, _ in edges:
        out_by[s].append(eid)
        in_by[t].append(eid)

    def refs(node: str) -> list[str]:
        return [f"      <bpmn:incoming>{escape(e)}</bpmn:incoming>" for e in in_by[node]] + [
            f"      <bpmn:outgoing>{escape(e)}</bpmn:outgoing>" for e in out_by[node]
        ]

    lines.append(f"    <bpmn:startEvent id={attr(start_id)}>")
    lines += refs(start_id)
    lines.append("    </bpmn:startEvent>")
    for t in tasks:
        lines.append(f"    <bpmn:task id={attr(xid[t['id']])} name={attr(_sim_name(t))}>")
        lines += refs(xid[t["id"]])
        lines.append("    </bpmn:task>")
    for gw in join_gw.values():
        lines.append(f"    <bpmn:parallelGateway id={attr(gw)}>")
        lines += refs(gw)
        lines.append("    </bpmn:parallelGateway>")
    lines.append(f"    <bpmn:endEvent id={attr(end_id)}>")
    lines += refs(end_id)
    lines.append("    </bpmn:endEvent>")
    for eid, s, t, label in edges:
        name_attr = f" name={attr(label)}" if label else ""
        lines.append(f"    <bpmn:sequenceFlow id={attr(eid)} sourceRef={attr(s)} targetRef={attr(t)}{name_attr} />")
    lines.append("  </bpmn:process>")
    lines.append('  <bpmndi:BPMNDiagram id="BPMNDiagram_1">')
    lines.append(f'    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement={attr(proc_id)}>')
    for n, (x, y, w, h) in pos.items():
        lines.append(f"      <bpmndi:BPMNShape id={attr(n + '_di')} bpmnElement={attr(n)}>")
        lines.append(f'        <dc:Bounds x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" />')
        lines.append("      </bpmndi:BPMNShape>")
    for eid, s, t, _ in edges:
        sx, sy, sw, sh = pos[s]
        tx, ty, tw, th = pos[t]
        x1, y1 = sx + sw, sy + sh / 2
        x2, y2 = tx, ty + th / 2
        lines.append(f"      <bpmndi:BPMNEdge id={attr(eid + '_di')} bpmnElement={attr(eid)}>")
        if abs(y1 - y2) < 1 or x2 <= x1:
            lines.append(f'        <di:waypoint x="{x1:g}" y="{y1:g}" />')
            lines.append(f'        <di:waypoint x="{x2:g}" y="{y2:g}" />')
        else:
            mx = (x1 + x2) / 2
            for px, py in ((x1, y1), (mx, y1), (mx, y2), (x2, y2)):
                lines.append(f'        <di:waypoint x="{px:g}" y="{py:g}" />')
        lines.append("      </bpmndi:BPMNEdge>")
    lines.append("    </bpmndi:BPMNPlane>")
    lines.append("  </bpmndi:BPMNDiagram>")
    lines.append("</bpmn:definitions>")
    return "\n".join(lines) + "\n"
