"""BPMN import/export in the bpmn-graph-sim task format."""

from __future__ import annotations

import unittest
import xml.etree.ElementTree as ET

from apps.simulations.engine import BpmnError, run
from apps.simulations.engine.bpmn import BPMN_NS, BPMNDI_NS, parse_sim_name, read_bpmn, write_bpmn

# Same structure as tests/test4.bpmn in KORALLE-bpmn-graph-sim.
SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">
  <bpmn:process id="p">
    <bpmn:startEvent id="s" />
    <bpmn:task id="pre" name="Pre;1;0;100;0.05;XOR" />
    <bpmn:task id="a" name="A;4.5;1;5;0.5;AND" />
    <bpmn:task id="b" name="B;2;0.1;2;0.1;AND" />
    <bpmn:endEvent id="e" />
    <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="pre" />
    <bpmn:sequenceFlow id="f2" sourceRef="pre" targetRef="a" />
    <bpmn:sequenceFlow id="f3" sourceRef="pre" targetRef="b" />
    <bpmn:sequenceFlow id="f4" sourceRef="a" targetRef="e" />
    <bpmn:sequenceFlow id="f5" sourceRef="b" targetRef="e" />
  </bpmn:process>
</bpmn:definitions>
"""


class BpmnTest(unittest.TestCase):
    def test_parse_sim_name(self) -> None:
        self.assertEqual(
            parse_sim_name("Task 2.2;3;1;7;0.2;XOR"),
            {"label": "Task 2.2", "time": 3.0, "variance": 1.0, "capacity": 7, "failChance": 0.2, "split": "XOR"},
        )
        self.assertIsNone(parse_sim_name("Lackieren"))
        self.assertIsNone(parse_sim_name("a;b;c;d;e;f"))

    def test_read_sim_format(self) -> None:
        out = read_bpmn(SAMPLE)
        p = out["process"]
        self.assertEqual([t["id"] for t in p["tasks"]], ["pre", "a", "b"])
        self.assertEqual(p["entry"], ["pre"])
        self.assertEqual(p["exit"], ["a", "b"])
        self.assertEqual(p["tasks"][0]["split"], "XOR")
        self.assertEqual(p["tasks"][1]["capacity"], 5)
        self.assertEqual(len(p["flows"]), 2)
        self.assertEqual(out["warnings"], [])
        r = run({"process": p, "settings": {"parts": 50, "replications": 1}})
        self.assertEqual(r["scenarios"][0]["kpis"]["completed"]["mean"], 50)

    def test_plain_bpmn_gets_gateways_and_warnings(self) -> None:
        xml = SAMPLE.replace('name="Pre;1;0;100;0.05;XOR"', 'name="Vorbereiten"').replace(
            '<bpmn:task id="pre"', '<bpmn:exclusiveGateway id="gw" /><bpmn:task id="pre"'
        )
        out = read_bpmn(xml)
        gw = next(t for t in out["process"]["tasks"] if t["id"] == "gw")
        self.assertEqual(gw["split"], "XOR")
        self.assertTrue(any("Vorbereiten" in w for w in out["warnings"]))

    def test_round_trip_keeps_parameters(self) -> None:
        process = {
            "tasks": [
                {
                    "id": "p-lack",
                    "label": "Lackanlage; Linie 1",
                    "time": 240,
                    "variance": 100,
                    "capacity": 2,
                    "failChance": 0.05,
                    "split": "AND",
                },
                {"id": "p-q", "label": "Qualität", "time": 60, "capacity": 1, "split": "XOR"},
                {"id": "p-ok", "label": "OK", "time": 1},
                {"id": "p-nio", "label": "Nacharbeit", "time": 300},
            ],
            "flows": [
                {"id": "e1", "source": "p-lack", "target": "p-q"},
                {"id": "e2", "source": "p-q", "target": "p-ok", "weight": 90},
                {"id": "e3", "source": "p-q", "target": "p-nio", "weight": 10},
            ],
        }
        xml = write_bpmn(process, "Lack")
        root = ET.fromstring(xml)
        ns = {"bpmn": BPMN_NS, "bpmndi": BPMNDI_NS}
        self.assertEqual(len(root.findall(".//bpmndi:BPMNShape", ns)), 6)
        back = read_bpmn(xml)["process"]
        by_id = {t["id"]: t for t in back["tasks"]}
        self.assertEqual(by_id["p-lack"]["label"], "Lackanlage, Linie 1")
        self.assertEqual(by_id["p-lack"]["capacity"], 2)
        self.assertEqual(by_id["p-lack"]["failChance"], 0.05)
        self.assertEqual(by_id["p-q"]["split"], "XOR")
        self.assertEqual({f["weight"] for f in back["flows"] if "weight" in f}, {90.0, 10.0})
        self.assertEqual(sorted(back["exit"]), ["p-nio", "p-ok"])

    def test_and_join_becomes_parallel_gateway(self) -> None:
        process = {
            "tasks": [{"id": "a", "time": 1}, {"id": "b", "time": 1}, {"id": "m", "time": 1, "join": "AND"}],
            "flows": [{"source": "a", "target": "m"}, {"source": "b", "target": "m"}],
        }
        xml = write_bpmn(process)
        self.assertIn("parallelGateway", xml)
        back = read_bpmn(xml)["process"]
        r = run({"process": back, "settings": {"parts": 3, "replications": 1}})
        m = next(t for t in r["scenarios"][0]["tasks"] if t["id"] == "m")
        self.assertEqual(m["processed"], 3)

    def test_errors(self) -> None:
        with self.assertRaises(BpmnError):
            read_bpmn("<nope")
        with self.assertRaises(BpmnError):
            read_bpmn("<root/>")
        with self.assertRaises(BpmnError):
            read_bpmn(SAMPLE.replace('<bpmn:startEvent id="s" />', ""))


if __name__ == "__main__":
    unittest.main()
