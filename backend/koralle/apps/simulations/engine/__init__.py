"""Simulation engine of the KORALLE platform (contract koralle.sim/v1).

Framework-free on purpose: no Django imports, standard library only. The
Django app (`services.py`, later a Celery task in `apps/runtime`) wraps it.

    from apps.simulations.engine import run
    result = run(request_json)
"""

from .constants import CONTRACT, ENGINE_VERSION
from .contract import engine_info, parse_process, parse_request, run
from .errors import BpmnError, ContractError, LimitError

__all__ = [
    "CONTRACT",
    "ENGINE_VERSION",
    "BpmnError",
    "ContractError",
    "LimitError",
    "engine_info",
    "parse_process",
    "parse_request",
    "run",
]
