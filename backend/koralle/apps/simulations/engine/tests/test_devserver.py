"""The development server answers like the planned Django endpoints."""

from __future__ import annotations

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from apps.simulations.engine.devserver import Handler

from .helpers import chain, request


class QuietHandler(Handler):
    def log_message(self, fmt: str, *args: object) -> None:
        pass


class DevServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def call(
        self, method: str, path: str, body: object = None, ctype: str = "application/json"
    ) -> tuple[int, dict, bytes]:
        data = None
        if body is not None:
            data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return res.status, dict(res.headers), res.read()
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers), err.read()

    def test_engine_info(self) -> None:
        status, headers, body = self.call("GET", "/api/simulations/engine/")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["engine"]["contract"], "koralle.sim/v1")
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")

    def test_run_list_and_get(self) -> None:
        status, _, body = self.call(
            "POST", "/api/organizations/magna-meerane/simulations/", request(chain(60, 90), parts=10)
        )
        self.assertEqual(status, 201)
        run_obj = json.loads(body)
        self.assertEqual(run_obj["status"], "succeeded")
        status, _, body = self.call("GET", f"/api/organizations/magna-meerane/simulations/{run_obj['id']}/")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["result"]["scenarios"][0]["kpis"]["completed"]["mean"], 10)
        status, _, body = self.call("GET", "/api/organizations/magna-meerane/simulations/")
        self.assertIn(run_obj["id"], [r["id"] for r in json.loads(body)["results"]])
        status, _, _ = self.call("GET", f"/api/organizations/other/simulations/{run_obj['id']}/")
        self.assertEqual(status, 404)

    def test_validation_errors_are_json(self) -> None:
        status, _, body = self.call("POST", "/api/organizations/x/simulations/", {"process": {"tasks": []}})
        self.assertEqual(status, 400)
        err = json.loads(body)["error"]
        self.assertEqual(err["code"], "invalid_request")
        self.assertTrue(err["details"])
        status, _, body = self.call("POST", "/api/organizations/x/simulations/", "{oops")
        self.assertEqual(status, 400)

    def test_bpmn_export_and_import(self) -> None:
        status, headers, body = self.call(
            "POST", "/api/organizations/x/simulations/bpmn/export/", {"process": chain(5, 6), "name": "Test Kette"}
        )
        self.assertEqual(status, 200)
        self.assertIn("Test-Kette.bpmn", headers.get("Content-Disposition", ""))
        status, _, out = self.call(
            "POST", "/api/organizations/x/simulations/bpmn/import/", body.decode(), "application/xml"
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(out)["process"]["tasks"]), 2)

    def test_preflight(self) -> None:
        status, headers, _ = self.call("OPTIONS", "/api/organizations/x/simulations/")
        self.assertEqual(status, 204)
        self.assertIn("POST", headers.get("Access-Control-Allow-Methods", ""))


if __name__ == "__main__":
    unittest.main()
