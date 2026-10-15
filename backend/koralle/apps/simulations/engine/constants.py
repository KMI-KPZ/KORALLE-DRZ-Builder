"""Defaults and limits of the simulation engine (contract koralle.sim/v1)."""

from __future__ import annotations

CONTRACT = "koralle.sim/v1"
ENGINE_NAME = "koralle-sim"
ENGINE_VERSION = "0.1.0"
ENGINE_MODEL = (
    "Event-driven discrete simulation following the task model of KORALLE-bpmn-graph-sim "
    "(time, variance, capacity, fail_chance, gateway_type)."
)

TIME_UNIT = "s"

# Gateway types. "OR" is accepted for compatibility with bpmn-graph-sim and behaves like XOR there.
SPLIT_TYPES = ("AND", "XOR", "OR")
JOIN_TYPES = ("AND", "XOR")
DEFAULT_SPLIT = "AND"
DEFAULT_JOIN = "AND"

ARRIVAL_TYPES = ("fixed", "exponential")
TIME_SAMPLING = ("perPart", "perRun")

DEFAULT_SETTINGS = {
    "parts": 200,
    "interarrival": 90.0,
    "arrival": "fixed",
    "replications": 10,
    "seed": 1,
    "timeSampling": "perPart",
    "maxSimTime": None,
    "eventLog": False,
}

# Request limits for a synchronous run. Larger studies belong into a background job (Celery).
MAX_PARTS = 20_000
MAX_REPLICATIONS = 200
MAX_TASKS = 500
MAX_SCENARIOS = 12
MAX_WORK = 1_500_000  # parts × replications × scenarios × Σ 1/(1 − failChance) over tasks (≈ 10 s)
MAX_EVENT_LOG = 20_000
MAX_TOKENS_PER_PART = 1_000
# Events of one request (all scenarios and replications); stops loops and very high failure rates.
MAX_EVENTS_TOTAL = 6_000_000
# Upper bounds for times and values (seconds), so that results stay finite.
MAX_TIME = 1e9
MAX_CAPACITY = 1_000_000
MAX_WEIGHT = 1e9

BOTTLENECK_LIMIT = 5

# Internal node ids of the virtual start and end of the process chain.
START_ID = "__start__"
END_ID = "__end__"
