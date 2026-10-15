"""Regression tests for issues found in review (duplicate targets, downtime order, horizon, budget, joins)."""

from __future__ import annotations

import unittest
from unittest import mock

from apps.simulations.engine import ContractError, LimitError, parse_request, run

from .helpers import chain, kpi, request, task


class RegressionTest(unittest.TestCase):
    def test_duplicate_flows_and_entries_are_rejected_or_merged(self) -> None:
        process = {
            "tasks": [{"id": "a", "time": 1}, {"id": "b", "time": 100}],
            "flows": [{"id": "f1", "source": "a", "target": "b"}, {"id": "f2", "source": "a", "target": "b"}],
        }
        with self.assertRaises(ContractError) as ctx:
            parse_request(request(process))
        self.assertIn("process.flows[1]", [d.path for d in ctx.exception.details])
        req = parse_request(request({"tasks": [{"id": "a", "time": 100}], "entry": ["a", "a"]}))
        self.assertEqual(req.graph.entry, ("a",))
        r = run(request({"tasks": [{"id": "a", "time": 100}], "entry": ["a", "a"]}, parts=3, interarrival=10))
        self.assertEqual(task(r, "a")["maxOccupied"], 1)

    def test_queue_moves_before_an_arrival_at_the_end_of_a_downtime(self) -> None:
        down = [{"start": 100, "duration": 100}]
        scenarios = [{"id": "d", "label": "d", "overrides": [{"task": "t0", "downtimes": down}]}]
        r = run(request(chain(10), scenarios, parts=5, interarrival=50, eventLog=True))
        starts = [e["part"] for e in r["scenarios"][0]["eventLog"] if e["event"] == "start" and e["t"] >= 200]
        self.assertEqual(starts, [2, 3, 4])

    def test_busy_time_is_work_time_not_pause(self) -> None:
        for start in (50, 150):
            down = [{"start": start, "duration": 1000}]
            scenarios = [{"id": "d", "label": "d", "overrides": [{"task": "t0", "downtimes": down}]}]
            r = run(request(chain(100), scenarios, parts=2, interarrival=200))
            self.assertAlmostEqual(task(r, "t0")["busyTime"], 200)

    def test_utilization_never_exceeds_one(self) -> None:
        process = {
            "tasks": [{"id": "a", "time": 1, "split": "XOR"}, {"id": "ok", "time": 1}, {"id": "dead", "time": 5000}],
            "flows": [{"source": "a", "target": "ok"}, {"source": "a", "target": "dead"}],
            "entry": ["a"],
            "exit": ["ok"],
        }
        for seed in range(1, 6):
            r = run(request(process, parts=4, seed=seed))
            for t in r["scenarios"][0]["tasks"]:
                self.assertLessEqual(t["utilization"], 1.0 + 1e-9, (seed, t["id"]))

    def test_late_downtime_does_not_stretch_the_makespan(self) -> None:
        down = [{"start": 9000, "duration": 10}]
        scenarios = [{"id": "d", "label": "d", "overrides": [{"task": "t0", "downtimes": down}]}]
        r = run(request(chain(100), scenarios, parts=1, maxSimTime=5000))
        self.assertEqual(kpi(r, "makespan"), 100)
        self.assertEqual(task(r, "t0")["utilization"], 1.0)

    def test_event_budget_stops_endless_loops(self) -> None:
        process = {
            "tasks": [{"id": "a", "time": 0, "split": "XOR", "join": "XOR"}, {"id": "b", "time": 0, "split": "XOR"}],
            "flows": [{"source": "a", "target": "b"}, {"source": "b", "target": "a", "weight": 1e9}],
            "entry": ["a"],
            "exit": ["b"],
        }
        with mock.patch("apps.simulations.engine.contract.MAX_EVENTS_TOTAL", 20_000):
            r = run(request(process, parts=1, replications=2))
        self.assertEqual(kpi(r, "incomplete"), 1)
        self.assertEqual(kpi(r, "stuck"), 0)
        self.assertTrue(any("Rechenbudget" in w for w in r["scenarios"][0]["warnings"]))

    def test_fail_chance_counts_towards_the_size_limit(self) -> None:
        with self.assertRaises(LimitError):
            parse_request(request(chain(1, 1, failChance=0.99), parts=8000, replications=1))

    def test_lead_time_ignores_replications_without_finished_parts(self) -> None:
        r = run(request(chain(100, variance=2500), parts=1, replications=20, maxSimTime=100))
        self.assertGreater(kpi(r, "leadTime", stat="min"), 0)

    def test_huge_numbers_are_validation_errors(self) -> None:
        for settings in ({"parts": 10**400}, {"interarrival": 1e308}, {"seed": 10**400}):
            with self.assertRaises(ContractError):
                parse_request(request(chain(1), **settings))
        with self.assertRaises(ContractError):
            parse_request(request({"tasks": [{"id": "a", "time": 10**400}]}))

    def test_and_join_waits_for_each_incoming_flow(self) -> None:
        process = {
            "tasks": [
                {"id": "s", "time": 1},
                {"id": "x", "time": 1},
                {"id": "y", "time": 100},
                {"id": "p", "time": 1},
                {"id": "q", "time": 1},
                {"id": "r", "time": 1, "join": "XOR", "capacity": 2},
                {"id": "j", "time": 1, "join": "AND"},
            ],
            "flows": [
                {"source": "s", "target": "x"},
                {"source": "s", "target": "y"},
                {"source": "x", "target": "p"},
                {"source": "x", "target": "q"},
                {"source": "p", "target": "r"},
                {"source": "q", "target": "r"},
                {"source": "r", "target": "j"},
                {"source": "y", "target": "j"},
            ],
        }
        r = run(request(process, parts=1, eventLog=True))
        first_j = min(e["t"] for e in r["scenarios"][0]["eventLog"] if e["task"] == "j" and e["event"] == "start")
        self.assertGreaterEqual(first_j, 101)

    def test_scenario_split_override_stays_xor(self) -> None:
        req = parse_request(request(chain(1, 1), [{"id": "s", "overrides": [{"task": "t0", "split": "XOR"}]}]))
        self.assertEqual(req.scenarios[0].overrides[0].split, "XOR")
        req = parse_request(request(chain(1, 1), [{"id": "s", "overrides": [{"task": "t0", "split": "OR"}]}]))
        self.assertEqual(req.scenarios[0].overrides[0].split, "XOR")


if __name__ == "__main__":
    unittest.main()
