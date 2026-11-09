"""The status command must expose a dead fleet's evidence instead of hiding it."""

import argparse
import contextlib
from io import BytesIO, StringIO
import json
import os
import sys
import time
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent_beacon.cli import handle_status
from agent_beacon.core import AgentStatus, HeartbeatPayload
from agent_beacon.server import BeaconServer


class TestStatusCli(unittest.TestCase):
    def test_actual_sentinel_dead_summary_is_readable(self):
        server = BeaconServer(host="127.0.0.1", http_port=0, udp_port=None)
        port, _ = server.start()
        try:
            record, *_ = server.store.register_or_update(HeartbeatPayload(id="stalled-worker"))
            record.last_ping_at = time.time() - 10_000
            record.status = AgentStatus.DEAD
            output = StringIO()
            with contextlib.redirect_stdout(output):
                handle_status(argparse.Namespace(url=f"http://127.0.0.1:{port}", json=True))
            data = json.loads(output.getvalue())
            self.assertEqual(data["summary"]["dead"], 1)
            self.assertEqual(data["summary"]["agents"][0]["id"], "stalled-worker")
        finally:
            server.stop()

    def test_dead_fleet_json_remains_parseable(self):
        summary = {"mesh": "agent-beacon", "summary": {
            "total": 1, "healthy": 0, "degraded": 0, "dead": 1, "deregistered": 0,
            "agents": [{"id": "stalled-worker", "status": "DEAD"}],
        }}
        response = urllib.error.HTTPError(
            "http://127.0.0.1:8765/status", 503, "Service Unavailable", {},
            BytesIO(json.dumps(summary).encode()),
        )
        output = StringIO()
        with patch("urllib.request.urlopen", side_effect=response), contextlib.redirect_stdout(output):
            handle_status(argparse.Namespace(url="http://127.0.0.1:8765", json=True))
        self.assertEqual(json.loads(output.getvalue()), summary)

    def test_transport_failure_leaves_json_stdout_empty_and_explains_recovery(self):
        output, errors = StringIO(), StringIO()
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                with self.assertRaises(SystemExit) as exit_result:
                    handle_status(argparse.Namespace(url="http://127.0.0.1:8765", json=True))
        self.assertEqual(exit_result.exception.code, 1)
        self.assertEqual(output.getvalue(), "")
        self.assertIn("start the beacon server", errors.getvalue())

    def test_unrelated_http_error_is_not_a_fleet_summary(self):
        response = urllib.error.HTTPError(
            "http://127.0.0.1:8765/status", 403, "Forbidden", {}, BytesIO(b'{}'),
        )
        with patch("urllib.request.urlopen", side_effect=response), contextlib.redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit):
                handle_status(argparse.Namespace(url="http://127.0.0.1:8765", json=True))

    def test_service_errors_and_malformed_summaries_never_become_fleet_success(self):
        cases = [None, [], {}, {"error": "upstream unavailable"},
                 {"mesh": "agent-beacon", "summary": {"dead": 1}},
                 {"mesh": "agent-beacon", "summary": {
                     "total": 1, "healthy": 0, "degraded": 0, "dead": True, "deregistered": 0,
                     "agents": [{"id": "worker", "status": "DEAD"}],
                 }},
                 {"mesh": "agent-beacon", "summary": {
                     "total": 1, "healthy": 0, "degraded": 0, "dead": 1, "deregistered": 0,
                     "agents": [{"id": "worker", "status": "HEALTHY"}],
                 }}]
        for payload in cases:
            for as_json in (True, False):
                with self.subTest(payload=payload, as_json=as_json):
                    response = urllib.error.HTTPError(
                        "http://127.0.0.1:8765/status", 503, "Service Unavailable", {},
                        BytesIO(json.dumps(payload).encode()),
                    )
                    output, errors = StringIO(), StringIO()
                    with patch("urllib.request.urlopen", side_effect=response):
                        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                            with self.assertRaises(SystemExit) as exit_result:
                                handle_status(argparse.Namespace(url="http://127.0.0.1:8765", json=as_json))
                    self.assertEqual(exit_result.exception.code, 1)
                    self.assertEqual(output.getvalue(), "")
                    self.assertIn("did not contain a valid dead-fleet summary", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
