"""Behaviour of the event-driven engine."""

from __future__ import annotations

import unittest

from apps.simulations.engine import run

from .helpers import chain, kpi, request, task


class FlowLineTest(unittest.TestCase):
    def test_balanced_line_runs_in_takt(self) -> None:
        r = run(request(chain(90, 90, 90), parts=10))
        self.assertAlmostEqual(kpi(r, "leadTime"), 270)
        self.assertAlmostEqual(kpi(r, "throughputPerHour"), 40)
        self.assertEqual(kpi(r, "completed"), 10)
        self.assertEqual(kpi(r, "blockedTime"), 0)
        # a balanced line has no single bottleneck
        self.assertEqual(r["scenarios"][0]["bottlenecks"], [])
        self.assertTrue(any("Ausgeglichen" in n for n in r["scenarios"][0]["notes"]))

    def test_buffer_fills_in_front_of_the_bottleneck(self) -> None:
        process = chain(60, 0, 120)
        process["tasks"][1]["capacity"] = 5
        r = run(request(process, parts=60, interarrival=60))
        buffer = task(r, "t1")
        self.assertEqual(buffer["maxOccupied"], 5)
        self.assertGreater(buffer["avgOccupied"], 3)
        # waiting inside a buffer is storage, not blocking
        self.assertEqual(buffer["blockedTime"], 0)
        self.assertEqual(task(r, "t2")["blockingCaused"], task(r, "t0")["blockedTime"])
        self.assertGreater(buffer["bufferedTime"], 0)
        self.assertGreater(kpi(r, "bufferTime"), 0)
        self.assertEqual(r["scenarios"][0]["bottlenecks"][0]["task"], "t2")

    def test_slowest_step_limits_output_and_is_the_bottleneck(self) -> None:
        r = run(request(chain(60, 120, 60), parts=40))
        self.assertAlmostEqual(kpi(r, "throughputPerHour"), 30, places=3)
        self.assertEqual(r["scenarios"][0]["bottlenecks"][0]["task"], "t1")
        # back-pressure: the step in front of the bottleneck waits, the one behind does not
        self.assertGreater(task(r, "t0")["blockedTime"], 0)
        self.assertEqual(task(r, "t2")["blockedTime"], 0)
        self.assertGreater(task(r, "t1")["blockingCaused"], 0)
        self.assertGreater(kpi(r, "entryWait"), 0)

    def test_parallel_capacity(self) -> None:
        r = run(request(chain(180, capacity=2), parts=20))
        self.assertAlmostEqual(kpi(r, "throughputPerHour"), 40, places=3)
        self.assertAlmostEqual(kpi(r, "leadTime"), 180)

    def test_downtime_pauses_work(self) -> None:
        process = chain(100)
        scenarios = [
            {"id": "base", "label": "Basis"},
            {
                "id": "down",
                "label": "Stillstand",
                "overrides": [{"task": "t0", "downtimes": [{"start": 50, "duration": 30}]}],
            },
        ]
        r = run(request(process, scenarios, parts=1))
        self.assertAlmostEqual(kpi(r, "leadTime", 0), 100)
        self.assertAlmostEqual(kpi(r, "leadTime", 1), 130)

    def test_disturbance_behind_a_buffer_is_still_the_cause(self) -> None:
        process = chain(80, 0, 80, 80)
        process["tasks"][1]["capacity"] = 4
        scenarios = [
            {"id": "base", "label": "Basis"},
            {
                "id": "down",
                "label": "Stillstand",
                "overrides": [{"task": "t3", "downtimes": [{"start": 900, "duration": 1200}]}],
            },
        ]
        r = run(request(process, scenarios, parts=60))
        self.assertEqual(r["scenarios"][1]["bottlenecks"][0]["task"], "t3")
        self.assertGreater(task(r, "t1", 1)["bufferedTime"], 0)

    def test_downtime_creates_back_pressure_upstream(self) -> None:
        scenarios = [
            {"id": "base", "label": "Basis"},
            {
                "id": "down",
                "label": "Stillstand t2",
                "overrides": [{"task": "t2", "downtimes": [{"start": 600, "duration": 900}]}],
            },
        ]
        r = run(request(chain(80, 80, 80), scenarios, parts=40))
        self.assertEqual(task(r, "t1", 0)["blockedTime"], 0)
        self.assertGreater(task(r, "t1", 1)["blockedTime"], 0)
        self.assertGreater(task(r, "t0", 1)["blockedTime"], 0)
        self.assertGreater(kpi(r, "leadTime", 1), kpi(r, "leadTime", 0))
        self.assertEqual(kpi(r, "completed", 1), 40)
        # the stopped step is the root cause, not the full step in front of it
        self.assertEqual(r["scenarios"][1]["bottlenecks"][0]["task"], "t2")
        self.assertAlmostEqual(task(r, "t2", 1)["blockingCaused"], kpi(r, "blockedTime", 1), delta=1)

    def test_identical_scenario_gives_identical_numbers(self) -> None:
        scenarios = [{"id": "a", "label": "A"}, {"id": "b", "label": "B", "overrides": []}]
        r = run(request(chain(60, 70, variance=200, failChance=0.1), scenarios, parts=50, replications=3))
        self.assertEqual(r["scenarios"][0]["kpis"], r["scenarios"][1]["kpis"])


class RandomnessTest(unittest.TestCase):
    def test_failures_restart_the_task(self) -> None:
        p = 0.2
        r = run(request(chain(10, failChance=p), parts=2000, interarrival=20))
        expected = 2000 * p / (1 - p)
        self.assertAlmostEqual(task(r, "t0")["failures"], expected, delta=expected * 0.12)
        self.assertEqual(task(r, "t0")["processed"], 2000)

    def test_xor_split_follows_the_shares(self) -> None:
        process = {
            "tasks": [
                {"id": "a", "time": 1, "split": "XOR"},
                {"id": "b", "time": 1, "capacity": 100},
                {"id": "c", "time": 1, "capacity": 100},
            ],
            "flows": [{"source": "a", "target": "b", "weight": 80}, {"source": "a", "target": "c", "weight": 20}],
        }
        r = run(request(process, parts=4000, interarrival=2))
        ratio = task(r, "b")["processed"] / max(1, task(r, "c")["processed"])
        self.assertAlmostEqual(ratio, 4, delta=0.5)
        self.assertEqual(kpi(r, "completed"), 4000)

    def test_seed_makes_runs_reproducible(self) -> None:
        payload = request(
            chain(60, 70, variance=400, failChance=0.05), parts=100, replications=2, arrival="exponential"
        )
        self.assertEqual(run(payload)["scenarios"], run(payload)["scenarios"])

    def test_per_run_sampling_uses_one_time_per_task(self) -> None:
        r = run(request(chain(50, variance=400), parts=30, interarrival=200, timeSampling="perRun", eventLog=True))
        log = r["scenarios"][0]["eventLog"]
        starts = {e["part"]: e["t"] for e in log if e["event"] == "start"}
        ends = {e["part"]: e["t"] for e in log if e["event"] == "end"}
        durations = {round(ends[p] - starts[p], 6) for p in ends}
        self.assertEqual(len(durations), 1)


class GatewayTest(unittest.TestCase):
    def diamond(self, join: str) -> dict:
        return {
            "tasks": [
                {"id": "a", "time": 10, "split": "AND"},
                {"id": "b", "time": 30},
                {"id": "c", "time": 50},
                {"id": "d", "time": 5, "join": join},
            ],
            "flows": [
                {"source": "a", "target": "b"},
                {"source": "a", "target": "c"},
                {"source": "b", "target": "d"},
                {"source": "c", "target": "d"},
            ],
        }

    def test_and_join_waits_for_all_branches(self) -> None:
        r = run(request(self.diamond("AND"), parts=1))
        self.assertAlmostEqual(kpi(r, "leadTime"), 10 + 50 + 5)
        self.assertEqual(task(r, "d")["processed"], 1)
        self.assertEqual(kpi(r, "completed"), 1)

    def test_xor_join_processes_every_arrival(self) -> None:
        r = run(request(self.diamond("XOR"), parts=1))
        self.assertEqual(task(r, "d")["processed"], 2)
        self.assertAlmostEqual(kpi(r, "leadTime"), 10 + 50 + 5)

    def test_dead_end_is_reported_as_stuck(self) -> None:
        # bpmn-graph-sim test5: the start splits to A and B, only B reaches the end.
        process = {
            "tasks": [{"id": "pre", "time": 1}, {"id": "a", "time": 4.5}, {"id": "b", "time": 2}],
            "flows": [{"source": "pre", "target": "a"}, {"source": "pre", "target": "b"}],
            "entry": ["pre"],
            "exit": ["b"],
        }
        r = run(request(process, parts=3))
        self.assertEqual(kpi(r, "stuck"), 3)
        self.assertEqual(kpi(r, "completed"), 0)
        self.assertTrue(any("Sackgasse" in w for w in r["scenarios"][0]["warnings"]))
        self.assertTrue(any("Führt nicht zum Ende" in w for w in r["warnings"]))

    def test_and_join_without_second_branch_waits_forever(self) -> None:
        process = {
            "tasks": [
                {"id": "a", "time": 1, "split": "XOR"},
                {"id": "b", "time": 1},
                {"id": "c", "time": 1},
                {"id": "d", "time": 1, "join": "AND"},
            ],
            "flows": [
                {"source": "a", "target": "b"},
                {"source": "a", "target": "c"},
                {"source": "b", "target": "d"},
                {"source": "c", "target": "d"},
            ],
        }
        r = run(request(process, parts=5))
        self.assertEqual(kpi(r, "stuck"), 5)
        self.assertTrue(any("UND-Zusammenführung" in w for w in r["scenarios"][0]["warnings"]))

    def rework(self, capacity: int) -> dict:
        return {
            "tasks": [
                {"id": "work", "time": 10, "join": "XOR", "capacity": capacity},
                {"id": "check", "time": 1, "split": "XOR", "capacity": capacity},
                {"id": "ok", "time": 1},
            ],
            "flows": [
                {"source": "work", "target": "check"},
                {"source": "check", "target": "work", "weight": 25},
                {"source": "check", "target": "ok", "weight": 75},
            ],
            "entry": ["work"],
        }

    def test_rework_loop_without_buffer_deadlocks_and_says_so(self) -> None:
        r = run(request(self.rework(1), parts=500, interarrival=12))
        self.assertGreater(kpi(r, "stuck"), 0)
        self.assertTrue(any("gegenseitige Blockade" in w for w in r["scenarios"][0]["warnings"]))

    def test_rework_loop_with_xor(self) -> None:
        r = run(request(self.rework(6), parts=2000, interarrival=40))
        self.assertEqual(kpi(r, "completed"), 2000)
        self.assertAlmostEqual(task(r, "work")["processed"] / 2000, 1 / 0.75, delta=0.08)


class HorizonTest(unittest.TestCase):
    def test_max_sim_time_leaves_parts_incomplete(self) -> None:
        r = run(request(chain(100), parts=50, maxSimTime=1000))
        self.assertLess(kpi(r, "completed"), 50)
        self.assertGreater(kpi(r, "incomplete"), 0)
        self.assertEqual(kpi(r, "stuck"), 0)


if __name__ == "__main__":
    unittest.main()
