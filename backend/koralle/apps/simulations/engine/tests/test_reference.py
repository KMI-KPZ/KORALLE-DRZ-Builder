"""Comparison with the original KORALLE-bpmn-graph-sim (skipped unless BPMN_GRAPH_SIM_PATH is set)."""

from __future__ import annotations

import unittest

from apps.simulations.engine import run
from apps.simulations.engine.reference import available, run_reference

from .helpers import chain


@unittest.skipIf(available() is None, "BPMN_GRAPH_SIM_PATH not set or numpy missing")
class ReferenceTest(unittest.TestCase):
    """bpmn-graph-sim is time-stepped. With a small step its result approaches the event-driven one."""

    CASES = [
        ((5, 3), 1, 4),
        ((4, 10, 2), 1, 5),
        ((2, 2, 2, 2), 1, 10),
        ((3, 8), 2, 8),
    ]

    def test_deterministic_lines_agree_in_the_limit(self) -> None:
        for times, capacity, parts in self.CASES:
            with self.subTest(times=times, capacity=capacity, parts=parts):
                process = chain(*times, capacity=capacity)
                ours = run(
                    {
                        "process": process,
                        "settings": {"parts": parts, "interarrival": 1e-9, "replications": 1, "timeSampling": "perRun"},
                    }
                )["scenarios"][0]["kpis"]["makespan"]["mean"]
                ref = run_reference(process, parts=parts, time_step=0.01)["simulationTime"]
                # one extra step per task and hand-over remains in the time-stepped original
                self.assertAlmostEqual(ref, ours, delta=0.01 * (len(times) + 2) * parts + 0.05)


if __name__ == "__main__":
    unittest.main()
