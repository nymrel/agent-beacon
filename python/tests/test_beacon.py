"""
Unit tests for Agent Beacon Python engine.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

import os
import sys
import time
import unittest
from io import StringIO

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agent_beacon.core import (
    AgentStatus,
    HeartbeatPayload,
    HeartbeatStore,
    Watchdog,
    BeaconEvent,
)
from agent_beacon.notifiers import (
    ConsoleNotifier,
    DiscordNotifier,
    SlackNotifier,
    TelegramNotifier,
    WebhookNotifier,
)
from agent_beacon.client import BeaconClient, beacon_watch
from agent_beacon.server import BeaconServer


class TestHeartbeatStore(unittest.TestCase):
    def setUp(self):
        self.store = HeartbeatStore(default_ttl_sec=10.0, default_grace_sec=5.0)

    def test_registration_and_updates(self):
        payload1 = HeartbeatPayload(
            id="py-agent-1",
            name="Python Worker 1",
            tags={"env": "unit-test"},
        )
        record, is_new, prev_status, status_changed = self.store.register_or_update(payload1)
        self.assertTrue(is_new)
        self.assertEqual(record.id, "py-agent-1")
        self.assertEqual(record.name, "Python Worker 1")
        self.assertEqual(record.status, AgentStatus.HEALTHY)
        self.assertEqual(record.total_pings, 1)
        self.assertEqual(record.tags["env"], "unit-test")

        # Update
        payload2 = HeartbeatPayload(
            id="py-agent-1",
            seq=2,
            tags={"step": "eval"},
        )
        record2, is_new2, prev_status2, status_changed2 = self.store.register_or_update(payload2)
        self.assertFalse(is_new2)
        self.assertEqual(record2.total_pings, 2)
        self.assertEqual(record2.seq, 2)
        self.assertEqual(record2.tags["step"], "eval")
        self.assertEqual(record2.tags["env"], "unit-test")

        # Summary
        summary = self.store.get_summary()
        self.assertEqual(summary["total"], 1)
        self.assertEqual(summary["healthy"], 1)
        self.assertEqual(summary["dead"], 0)

    def test_deregistration(self):
        self.store.register_or_update(HeartbeatPayload(id="retire-me"))
        record = self.store.deregister("retire-me", "Task completed")
        self.assertIsNotNone(record)
        self.assertEqual(record.status, AgentStatus.DEREGISTERED)

        summary = self.store.get_summary()
        self.assertEqual(summary["deregistered"], 1)
        self.assertEqual(summary["healthy"], 0)


class TestWatchdog(unittest.TestCase):
    def test_liveness_transitions(self):
        store = HeartbeatStore()
        watchdog = Watchdog(store, check_interval_sec=0.05)

        events = []
        watchdog.add_listener(lambda e: events.append(e))

        payload = HeartbeatPayload(
            id="watch-agent",
            name="Watchdog Test Agent",
            ttl_sec=0.1,
            grace_sec=0.1,
        )
        record = watchdog.record_ping(payload)
        self.assertEqual(record.status, AgentStatus.HEALTHY)
        self.assertEqual(events[0].type, "agent:registered")

        # Simulate TTL expiration (past 0.1s, within 0.2s)
        record.last_ping_at = time.time() - 0.15
        watchdog.check_liveness()
        self.assertEqual(record.status, AgentStatus.DEGRADED)

        # Simulate Dead-man's switch trigger (past 0.2s)
        record.last_ping_at = time.time() - 0.25
        watchdog.check_liveness()
        self.assertEqual(record.status, AgentStatus.DEAD)

        # Revive
        watchdog.record_ping(HeartbeatPayload(id="watch-agent"))
        self.assertEqual(record.status, AgentStatus.HEALTHY)
        recovered = [e for e in events if e.type == "agent:recovered"]
        self.assertTrue(len(recovered) > 0)


class TestNotifiers(unittest.TestCase):
    def test_console_notifier(self):
        notifier = ConsoleNotifier(audible_bell=False)
        store = HeartbeatStore()
        record, _, _, _ = store.register_or_update(HeartbeatPayload(id="notif-agent", name="Notifier Test"))

        event = BeaconEvent(
            type="agent:dead",
            agent_id="notif-agent",
            timestamp=time.time(),
            agent=record,
            reason="Simulated failure",
        )

        # Capture output
        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            notifier.notify(event)
            output = sys.stdout.getvalue()
            self.assertIn("DEAD", output)
            self.assertIn("notif-agent", output)
        finally:
            sys.stdout = old_stdout


class TestServerAndClient(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = BeaconServer(host="127.0.0.1", http_port=0, udp_port=0)
        cls.http_port, _ = cls.server.start()
        cls.url = f"http://127.0.0.1:{cls.http_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()

    def test_client_ping_and_done(self):
        client = BeaconClient(
            beacon_url=self.url,
            agent_id="py-client-1",
            name="Py Test Agent",
            interval_sec=0.1,
            tags={"suite": "integration"},
        )
        ok = client.ping(metrics={"step": 1})
        self.assertTrue(ok)

        record = self.server.store.get("py-client-1")
        self.assertIsNotNone(record)
        self.assertEqual(record.name, "Py Test Agent")
        self.assertEqual(record.tags["suite"], "integration")

        done_ok = client.done("Finished")
        self.assertTrue(done_ok)
        self.assertEqual(record.status, AgentStatus.DEREGISTERED)

    def test_context_manager_watch(self):
        with beacon_watch(beacon_url=self.url, agent_id="context-agent", name="Context Worker", interval_sec=0.1) as c:
            c.ping()
            rec = self.server.store.get("context-agent")
            self.assertEqual(rec.status, AgentStatus.HEALTHY)

        rec_after = self.server.store.get("context-agent")
        self.assertEqual(rec_after.status, AgentStatus.DEREGISTERED)


if __name__ == "__main__":
    unittest.main()
