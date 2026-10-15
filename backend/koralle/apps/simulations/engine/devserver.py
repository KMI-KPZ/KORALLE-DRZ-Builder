"""Stand-in HTTP server with the simulation endpoints of KORALLE-Backend.

Until the Django project serves `apps.simulations`, this server offers the
same paths and payloads so that the frontend can be built against them.
Standard library only, no database: runs are kept in memory.

    cd KORALLE-Backend/koralle
    python -m apps.simulations.engine.devserver --port 8000

Endpoints (organisation-scoped like the rest of the API):

    GET  /api/simulations/engine/
    GET  /api/organizations/{org}/simulations/
    POST /api/organizations/{org}/simulations/              koralle.sim/v1 request → run
    GET  /api/organizations/{org}/simulations/{id}/
    POST /api/organizations/{org}/simulations/bpmn/export/  {"process": …, "name": …} → BPMN XML
    POST /api/organizations/{org}/simulations/bpmn/import/  BPMN XML → {"process": …, "warnings": …}

There is no authentication. Do not expose it beyond a development machine
or a closed network.
"""

from __future__ import annotations

import argparse
import json
import re
import threading
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import reference
from .bpmn import read_bpmn, write_bpmn
from .constants import CONTRACT, MAX_PARTS, MAX_REPLICATIONS, MAX_SCENARIOS, MAX_TASKS, MAX_WORK
from .contract import engine_info, parse_process, run
from .errors import BpmnError, ContractError, LimitError

MAX_BODY = 8 * 1024 * 1024
MAX_RUNS_PER_ORG = 50
ORG = r"(?P<org>[A-Za-z0-9_.-]{1,80})"

_runs: dict[str, OrderedDict[str, dict[str, Any]]] = {}
_FAILED = object()  # marker: the error response was already sent
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _summary(run_obj: dict[str, Any]) -> dict[str, Any]:
    result = run_obj.get("result") or {}
    scenarios = []
    for s in result.get("scenarios", []):
        k = s.get("kpis", {})
        scenarios.append(
            {
                "id": s.get("id"),
                "label": s.get("label"),
                "throughputPerHour": k.get("throughputPerHour", {}).get("mean"),
                "leadTime": k.get("leadTime", {}).get("mean"),
            }
        )
    return {key: run_obj.get(key) for key in ("id", "organization", "status", "label", "createdAt", "finishedAt")} | {
        "scenarios": scenarios
    }


def _store(org: str, run_obj: dict[str, Any]) -> None:
    with _lock:
        runs = _runs.setdefault(org, OrderedDict())
        runs[run_obj["id"]] = run_obj
        while len(runs) > MAX_RUNS_PER_ORG:
            runs.popitem(last=False)


class Handler(BaseHTTPRequestHandler):
    server_version = "koralle-sim-devserver/0.1"
    allowed_origins: tuple[str, ...] = ("*",)

    # ── plumbing ─────────────────────────────────────────────────────

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: D401 - stdlib signature
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}", flush=True)

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if "*" in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif origin in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")

    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self._cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload: Any) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, status: int, code: str, message: str, details: list[dict[str, str]] | None = None) -> None:
        self._json(status, {"error": {"code": code, "message": message, "details": details or []}})

    def _body(self) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "too_large", "Anfrage ist zu groß.")
            return None
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> Any:
        raw = self._body()
        if raw is None:
            return _FAILED
        try:
            return json.loads(raw.decode("utf-8") or "null")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._error(HTTPStatus.BAD_REQUEST, "invalid_json", f"Kein gültiges JSON: {exc}")
            return _FAILED

    # ── routing ──────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/healthz", "/api/simulations/engine/", "/api/simulations/engine"):
            self._json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "engine": engine_info(),
                    "limits": {
                        "parts": MAX_PARTS,
                        "replications": MAX_REPLICATIONS,
                        "tasks": MAX_TASKS,
                        "scenarios": MAX_SCENARIOS,
                        "work": MAX_WORK,
                    },
                    "features": {
                        "bpmnImport": True,
                        "bpmnExport": True,
                        "reference": reference.available() is not None,
                    },
                    "server": "devserver",
                },
            )
            return
        m = re.fullmatch(rf"/api/organizations/{ORG}/simulations/?", path)
        if m:
            with _lock:
                runs = list(_runs.get(m["org"], {}).values())
            self._json(HTTPStatus.OK, {"results": [_summary(r) for r in reversed(runs)]})
            return
        m = re.fullmatch(rf"/api/organizations/{ORG}/simulations/(?P<id>[0-9a-f-]{{36}})/?", path)
        if m:
            with _lock:
                found = _runs.get(m["org"], {}).get(m["id"])
            if found is None:
                self._error(HTTPStatus.NOT_FOUND, "not_found", "Lauf nicht gefunden.")
            else:
                self._json(HTTPStatus.OK, found)
            return
        self._error(HTTPStatus.NOT_FOUND, "not_found", f"Unbekannter Pfad {path}")

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        m = re.fullmatch(rf"/api/organizations/{ORG}/simulations/?", path)
        if m:
            self._create_run(m["org"])
            return
        m = re.fullmatch(rf"/api/organizations/{ORG}/simulations/bpmn/export/?", path)
        if m:
            self._export_bpmn()
            return
        m = re.fullmatch(rf"/api/organizations/{ORG}/simulations/bpmn/import/?", path)
        if m:
            self._import_bpmn()
            return
        self._error(HTTPStatus.NOT_FOUND, "not_found", f"Unbekannter Pfad {path}")

    # ── handlers ─────────────────────────────────────────────────────

    def _create_run(self, org: str) -> None:
        payload = self._json_body()
        if payload is _FAILED:
            return
        created = _now()
        run_obj: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "organization": org,
            "contract": CONTRACT,
            "label": payload.get("label", "") if isinstance(payload, dict) else "",
            "createdAt": created,
            "startedAt": created,
        }
        try:
            result = run(payload)
        except LimitError as exc:
            self._error(HTTPStatus.UNPROCESSABLE_ENTITY, exc.code, exc.message)
            return
        except ContractError as exc:
            self._error(HTTPStatus.BAD_REQUEST, exc.code, exc.message, [d.to_dict() for d in exc.details])
            return
        run_obj.update({"status": "succeeded", "finishedAt": _now(), "result": result})
        _store(org, run_obj)
        self._json(HTTPStatus.CREATED, run_obj)

    def _export_bpmn(self) -> None:
        payload = self._json_body()
        if payload is _FAILED:
            return
        if not isinstance(payload, dict):
            self._error(HTTPStatus.BAD_REQUEST, "invalid_request", 'Erwartet {"process": …}.')
            return
        try:
            parse_process(payload.get("process"))
        except ContractError as exc:
            self._error(HTTPStatus.BAD_REQUEST, exc.code, exc.message, [d.to_dict() for d in exc.details])
            return
        name = payload.get("name") if isinstance(payload.get("name"), str) else "KORALLE Prozesskette"
        xml = write_bpmn(payload["process"], name)
        filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", name).strip("-") or "prozess"
        self._send(
            HTTPStatus.OK,
            xml.encode("utf-8"),
            "application/xml; charset=utf-8",
            {"Content-Disposition": f'attachment; filename="{filename}.bpmn"'},
        )

    def _import_bpmn(self) -> None:
        ctype = (self.headers.get("Content-Type") or "").lower()
        if "json" in ctype:
            payload = self._json_body()
            if payload is _FAILED:
                return
            xml = payload.get("bpmn") if isinstance(payload, dict) else None
        else:
            raw = self._body()
            if raw is None:
                return
            xml = raw.decode("utf-8", errors="replace")
        if not isinstance(xml, str) or not xml.strip():
            self._error(HTTPStatus.BAD_REQUEST, "invalid_bpmn", "Kein BPMN-Inhalt.")
            return
        try:
            self._json(HTTPStatus.OK, read_bpmn(xml))
        except BpmnError as exc:
            self._error(HTTPStatus.BAD_REQUEST, exc.code, exc.message)


def serve(host: str = "127.0.0.1", port: int = 8000, origins: tuple[str, ...] = ("*",)) -> None:
    Handler.allowed_origins = origins
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"koralle-sim devserver on http://{host}:{port} (contract {CONTRACT})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Development server for the KORALLE simulation endpoints.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--allow-origin",
        action="append",
        default=None,
        help="allowed CORS origin (repeatable); default: any",
    )
    args = parser.parse_args(argv)
    serve(args.host, args.port, tuple(args.allow_origin or ["*"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
