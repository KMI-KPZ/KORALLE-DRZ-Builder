"""Service layer of apps.simulations (see AGENTS.md: views stay thin, logic lives here).

The engine itself is framework-free (`apps.simulations.engine`). This module
is the place where the Django side plugs in once the app is installed:

* persist a `SimulationRun` (organization FK, request and result as JSONB,
  status, timestamps) before and after `run_simulation`;
* run large requests as a Celery task in `apps.runtime` and answer the HTTP
  request with 202 and the run id (the frontend already polls
  GET /api/organizations/{org}/simulations/{id}/ while the status is
  "queued" or "running").

Nothing here imports Django yet, so `manage.py check` is unaffected as long as
the app is not listed in INSTALLED_APPS.
"""

from __future__ import annotations

from typing import Any

from .engine import run
from .engine.bpmn import read_bpmn, write_bpmn


def run_simulation(payload: dict[str, Any]) -> dict[str, Any]:
    """Validates and runs a koralle.sim/v1 request. Raises engine.ContractError / engine.LimitError."""
    return run(payload)


def export_bpmn(process: dict[str, Any], name: str) -> str:
    """BPMN 2.0 (bpmn-graph-sim task format) for a koralle.sim/v1 process."""
    return write_bpmn(process, name)


def import_bpmn(xml: str) -> dict[str, Any]:
    """koralle.sim/v1 process from a BPMN document. Raises engine.BpmnError."""
    return read_bpmn(xml)
