"""The status command must expose a dead fleet's evidence instead of hiding it."""

import argparse
import contextlib
from io import BytesIO, StringIO
import json
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent_beacon.cli import handle_status


class TestStatusCli(unittest.TestCase):
    def test_dead_fleet_json_remains_parseable(self):
        summary = {"summary": {"total": 1, "healthy": 0, "dead": 1, "agents": [{"id": "stalled-worker", "status": "DEAD"}]}}
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


if __name__ == "__main__":
    unittest.main()
