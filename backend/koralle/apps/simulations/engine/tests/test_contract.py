"""Validation of koralle.sim/v1 requests."""

from __future__ import annotations

import unittest

from apps.simulations.engine import ContractError, LimitError, parse_request, run

from .helpers import chain, request


class ContractTest(unittest.TestCase):
    def paths(self, payload: object) -> list[str]:
        with self.assertRaises(ContractError) as ctx:
            parse_request(payload)
        return [d.path for d in ctx.exception.details]

    def test_defaults(self) -> None:
        req = parse_request({"process": chain(10)})
        self.assertEqual(req.settings.parts, 200)
        self.assertEqual(req.settings.interarrival, 90)
        self.assertEqual([s.id for s in req.scenarios], ["base"])
        self.assertEqual(req.graph.entry, ("t0",))
        self.assertEqual(req.graph.exit, ("t0",))

    def test_reports_every_problem_with_its_path(self) -> None:
        payload = request(
            {
                "tasks": [
                    {"id": "a", "time": -1, "capacity": 0},
                    {"id": "a", "time": 1},
                    {"id": "b", "time": 1, "failChance": 1, "split": "MAYBE"},
                ],
                "flows": [{"source": "a", "target": "x"}],
            },
            parts=0,
        )
        paths = self.paths(payload)
        for expected in (
            "process.tasks[0].time",
            "process.tasks[0].capacity",
            "process.tasks[1].id",
            "process.tasks[2].failChance",
            "process.tasks[2].split",
            "process.flows[0].target",
            "settings.parts",
        ):
            self.assertIn(expected, paths)

    def test_wrong_contract_and_missing_process(self) -> None:
        paths = self.paths({"contract": "other/v9"})
        self.assertIn("contract", paths)
        self.assertIn("process", paths)

    def test_scenario_must_reference_known_tasks(self) -> None:
        paths = self.paths(request(chain(1), [{"id": "s", "overrides": [{"task": "nope", "time": 3}]}]))
        self.assertIn("scenarios[0].overrides[0].task", paths)

    def test_downtime_needs_positive_duration(self) -> None:
        paths = self.paths(
            request(chain(1), [{"id": "s", "overrides": [{"task": "t0", "downtimes": [{"start": 5, "duration": 0}]}]}])
        )
        self.assertIn("scenarios[0].overrides[0].downtimes[0].duration", paths)

    def test_cycle_without_entry_is_rejected(self) -> None:
        process = {
            "tasks": [{"id": "a", "time": 1}, {"id": "b", "time": 1}],
            "flows": [{"source": "a", "target": "b"}, {"source": "b", "target": "a"}],
        }
        paths = self.paths(request(process))
        self.assertIn("process.entry", paths)
        self.assertIn("process.exit", paths)

    def test_too_large_requests_are_refused(self) -> None:
        with self.assertRaises(LimitError):
            parse_request(request(chain(*([1] * 400)), parts=20000, replications=10))

    def test_result_shape(self) -> None:
        r = run(request(chain(10, 20), parts=5))
        self.assertEqual(r["contract"], "koralle.sim/v1")
        self.assertEqual(r["timeUnit"], "s")
        s = r["scenarios"][0]
        self.assertEqual(set(s["kpis"]["leadTime"]), {"mean", "std", "min", "max", "p05", "p95"})
        self.assertEqual({t["id"] for t in s["tasks"]}, {"t0", "t1"})
        self.assertIn("engine", r)
        self.assertNotIn("eventLog", s)


if __name__ == "__main__":
    unittest.main()
