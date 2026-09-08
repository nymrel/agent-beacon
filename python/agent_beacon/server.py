"""
agent_beacon.server
~~~~~~~~~~~~~~~~~~~
Standalone HTTP & UDP Beacon Server in Python.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from __future__ import annotations
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import re
import socket
import threading
from urllib.parse import urlparse, parse_qs
from typing import Any, List, Optional
from .core import HeartbeatStore, Watchdog, HeartbeatPayload


class BeaconRequestHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP handler for Agent Beacon endpoints."""

    store: HeartbeatStore
    watchdog: Watchdog

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/llms.txt":
            content = (
                "# Agent Beacon Liveness Sentinel\n"
                "> Zero-dependency heartbeat monitor and dead-man's switch watchdog for autonomous AI agents.\n"
                "> Operating Organization: Nymrel -> JalenBuilds LLC\n\n"
                "## Endpoints\n"
                "- POST /ping\n"
                "- GET /status\n"
                "- GET /health\n"
                "- GET /agents\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
            return

        if path in ("/ping", "/api/v1/ping"):
            agent_id = query.get("id", [""])[0]
            if not agent_id:
                self._send_json(400, {"error": "Missing required query parameter 'id'"})
                return

            ttl_val = float(query.get("ttl", [30])[0]) if "ttl" in query else None
            grace_val = float(query.get("grace", [15])[0]) if "grace" in query else None
            status_val = query.get("status", ["ok"])[0]

            record = self.watchdog.record_ping(
                HeartbeatPayload(
                    id=agent_id,
                    name=query.get("name", [agent_id])[0],
                    ttl_sec=ttl_val,
                    grace_sec=grace_val,
                    status=status_val,
                )
            )
            self._send_json(200, {"ok": True, "agent": record.to_dict()})
            return

        if path in ("/health", "/status", "/api/v1/status"):
            summary = self.store.get_summary()
            status_code = 503 if summary["dead"] > 0 else 200
            self._send_json(
                status_code,
                {
                    "mesh": "agent-beacon",
                    "version": "1.0.0",
                    "organization": {"parent": "Nymrel", "legal": "JalenBuilds LLC"},
                    "summary": summary,
                },
            )
            return

        if path in ("/agents", "/api/v1/agents"):
            agents = [r.to_dict() for r in self.store.list()]
            self._send_json(200, {"total": len(agents), "agents": agents})
            return

        # Match /agents/<id>
        match = re.match(r"^/(?:api/v1/)?agents/([^/]+)$", path)
        if match:
            agent_id = match.group(1)
            record = self.store.get(agent_id)
            if not record:
                self._send_json(404, {"error": f"Agent '{agent_id}' not found"})
                return
            self._send_json(200, {"agent": record.to_dict()})
            return

        self._send_json(404, {"error": "Not Found", "supportedEndpoints": ["/ping", "/status", "/health", "/agents"]})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        if path in ("/ping", "/api/v1/ping"):
            agent_id = body.get("id", "").strip()
            if not agent_id:
                self._send_json(400, {"error": "Heartbeat payload must include non-empty 'id'"})
                return

            payload = HeartbeatPayload(
                id=agent_id,
                name=body.get("name"),
                ttl_sec=(
                    body.get("ttlSec")
                    or body.get("ttl_sec")
                    or body.get("interval")
                    or body.get("interval_sec")
                ),
                grace_sec=(
                    body.get("graceSec")
                    or body.get("grace_sec")
                    or body.get("grace")
                ),
                seq=body.get("seq"),
                status=body.get("status", "ok"),
                metrics=body.get("metrics", {}),
                tags=body.get("tags", {}),
                metadata=body.get("metadata", {}),
            )
            record = self.watchdog.record_ping(payload)
            self._send_json(200, {"ok": True, "agent": record.to_dict()})
            return

        if path in ("/deregister", "/api/v1/deregister"):
            agent_id = body.get("id", "").strip()
            if not agent_id:
                self._send_json(400, {"error": "Deregister payload must include 'id'"})
                return
            reason = body.get("reason", "Agent completed work gracefully")
            record = self.watchdog.deregister(agent_id, reason)
            if not record:
                self._send_json(404, {"error": f"Agent '{agent_id}' not found"})
                return
            self._send_json(200, {"ok": True, "status": "DEREGISTERED", "agent": record.to_dict()})
            return

        self._send_json(404, {"error": "Not Found"})

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        match = re.match(r"^/(?:api/v1/)?agents/([^/]+)$", path)
        if match:
            agent_id = match.group(1)
            record = self.watchdog.deregister(agent_id, "Deregistered via DELETE API")
            if not record:
                self._send_json(404, {"error": f"Agent '{agent_id}' not found"})
                return
            self._send_json(200, {"ok": True, "status": "DEREGISTERED", "agent": record.to_dict()})
            return

        self._send_json(404, {"error": "Not Found"})

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Beacon-Signature-256")

    def _send_json(self, status_code: int, data: Any) -> None:
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress standard logging to stdout to keep console clean
        pass


class BeaconUdpServer:
    """Zero-dependency UDP socket listener for fast datagram heartbeats in Python."""

    def __init__(self, watchdog: Watchdog, host: str = "127.0.0.1", port: int = 8766):
        self.watchdog = watchdog
        self.host = host
        self.port = port
        self._sock: Optional[socket.socket] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> int:
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.bind((self.host, self.port))
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self._sock.getsockname()[1]

    def stop(self) -> None:
        self._running = False
        if self._sock:
            self._sock.close()
            self._sock = None

    def _loop(self) -> None:
        while self._running and self._sock:
            try:
                data, _ = self._sock.recvfrom(2048)
                text = data.decode("utf-8", errors="ignore").strip()
                if not text:
                    continue
                if text.startswith("{") and text.endswith("}"):
                    obj = json.loads(text)
                    if "id" in obj:
                        self.watchdog.record_ping(
                            HeartbeatPayload(
                                id=obj["id"],
                                name=obj.get("name"),
                                seq=obj.get("seq"),
                                status=obj.get("status", "ok"),
                            )
                        )
                        continue
                if len(text) < 256:
                    self.watchdog.record_ping(HeartbeatPayload(id=text))
            except Exception:
                pass


class BeaconServer:
    """Unified Python server managing HTTP, UDP, Watchdog, Store, and Notifiers."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        http_port: int = 8765,
        udp_port: Optional[int] = 8766,
        default_ttl_sec: float = 30.0,
        default_grace_sec: float = 15.0,
        notifiers: Optional[List[Any]] = None,
    ):
        self.host = host
        self.http_port = http_port
        self.udp_port = udp_port

        self.store = HeartbeatStore(default_ttl_sec=default_ttl_sec, default_grace_sec=default_grace_sec)
        self.watchdog = Watchdog(self.store, check_interval_sec=1.0)

        if notifiers:
            for n in notifiers:
                self.watchdog.add_notifier(n)

        # Configure RequestHandler class attributes
        class BoundHandler(BeaconRequestHandler):
            store = self.store
            watchdog = self.watchdog

        self.http_server = HTTPServer((self.host, self.http_port), BoundHandler)
        self.udp_server = BeaconUdpServer(self.watchdog, host=self.host, port=self.udp_port) if self.udp_port else None

        self._http_thread: Optional[threading.Thread] = None

    def start(self) -> tuple[int, Optional[int]]:
        self.watchdog.start()
        self._http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
        self._http_thread.start()

        actual_http = self.http_server.server_port
        actual_udp = self.udp_server.start() if self.udp_server else None

        return actual_http, actual_udp

    def stop(self) -> None:
        self.watchdog.stop()
        if self.http_server:
            self.http_server.shutdown()
            self.http_server.server_close()
        if self.udp_server:
            self.udp_server.stop()
