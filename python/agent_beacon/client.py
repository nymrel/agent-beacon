"""
agent_beacon.client
~~~~~~~~~~~~~~~~~~~
Ultra-lightweight heartbeat client and context manager for Python agents.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from __future__ import annotations
from contextlib import contextmanager
import json
import os
import threading
import time
import urllib.request
from typing import Any, Dict, Generator, Optional
from .http_url import normalize_http_base_url, require_http_url


class BeaconClient:
    """Client for sending background or one-shot heartbeats to an Agent Beacon server."""

    def __init__(
        self,
        beacon_url: str = "http://127.0.0.1:8765",
        agent_id: Optional[str] = None,
        name: Optional[str] = None,
        interval_sec: float = 15.0,
        ttl_sec: float = 30.0,
        grace_sec: float = 15.0,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.beacon_url = normalize_http_base_url(beacon_url, "Beacon URL")
        self.agent_id = agent_id or f"py-agent-{os.getpid()}"
        self.name = name or self.agent_id
        self.interval_sec = interval_sec
        self.ttl_sec = ttl_sec
        self.grace_sec = grace_sec
        self.tags = dict(tags or {})
        self.metadata = dict(metadata or {})

        self._seq = 0
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> BeaconClient:
        """Start automatic background heartbeat loop."""
        if self._running:
            return self
        self._running = True

        # Send immediate ping
        try:
            self.ping()
        except Exception:
            pass

        self._thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> BeaconClient:
        """Stop background heartbeat loop."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        return self

    def ping(
        self,
        status: str = "ok",
        metrics: Optional[Dict[str, Any]] = None,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Send a single heartbeat ping to the beacon server."""
        self._seq += 1
        combined_tags = dict(self.tags)
        if tags:
            combined_tags.update(tags)

        combined_meta = dict(self.metadata)
        if metadata:
            combined_meta.update(metadata)

        payload = {
            "id": self.agent_id,
            "name": self.name,
            "ttlSec": self.ttl_sec,
            "graceSec": self.grace_sec,
            "seq": self._seq,
            "timestamp": int(time.time() * 1000),
            "status": status,
            "metrics": metrics or {"pid": os.getpid()},
            "tags": combined_tags,
            "metadata": combined_meta,
        }

        url = f"{self.beacon_url}/ping"
        self._post_json(url, payload)
        return True

    def done(self, reason: str = "Task finished successfully") -> bool:
        """Gracefully retire the agent upon task completion."""
        self.stop()
        url = f"{self.beacon_url}/deregister"
        try:
            self._post_json(url, {"id": self.agent_id, "reason": reason})
            return True
        except Exception:
            return False

    def _heartbeat_loop(self) -> None:
        while self._running:
            time.sleep(self.interval_sec)
            if not self._running:
                break
            try:
                self.ping()
            except Exception:
                pass

    def _post_json(self, url: str, data: Dict[str, Any]) -> None:
        payload_bytes = json.dumps(data).encode("utf-8")
        endpoint = require_http_url(url, "Beacon endpoint")
        req = urllib.request.Request(
            endpoint,
            data=payload_bytes,
            headers={"Content-Type": "application/json", "User-Agent": "AgentBeaconClient-Py/1.0.0"},
            method="POST",
        )
        # The shared validator restricts this request to an absolute HTTP(S) endpoint.
        with urllib.request.urlopen(req, timeout=5.0) as resp:  # nosec B310
            resp.read()


@contextmanager
def beacon_watch(
    beacon_url: str = "http://127.0.0.1:8765",
    agent_id: Optional[str] = None,
    name: Optional[str] = None,
    interval_sec: float = 10.0,
    ttl_sec: float = 30.0,
    tags: Optional[Dict[str, str]] = None,
) -> Generator[BeaconClient, None, None]:
    """
    Context manager that automatically maintains heartbeats during block execution
    and retires the agent cleanly on block exit (or sends error status on exception).
    """
    client = BeaconClient(
        beacon_url=beacon_url,
        agent_id=agent_id,
        name=name,
        interval_sec=interval_sec,
        ttl_sec=ttl_sec,
        tags=tags,
    )
    client.start()
    try:
        yield client
        client.done(reason="Block executed successfully")
    except Exception as exc:
        try:
            client.ping(status="error", metadata={"error": str(exc)})
        except Exception:
            pass
        client.stop()
        raise
