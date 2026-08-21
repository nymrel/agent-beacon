"""
agent_beacon.notifiers
~~~~~~~~~~~~~~~~~~~~~~
Pluggable alert dispatchers for Agent Beacon in Python.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from __future__ import annotations
import hmac
import hashlib
import json
import sys
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional
from .core import BeaconEvent


class BaseNotifier:
    """Base class for all Python notifiers."""

    def __init__(self, enabled_events: Optional[List[str]] = None):
        self.enabled_events = set(
            enabled_events
            or [
                "agent:dead",
                "agent:recovered",
                "agent:degraded",
                "agent:registered",
                "agent:deregistered",
            ]
        )

    def should_notify(self, event: BeaconEvent) -> bool:
        return event.type in self.enabled_events

    def notify(self, event: BeaconEvent) -> None:
        raise NotImplementedError

    def _post_json(self, url: str, data: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> None:
        req_headers = {
            "Content-Type": "application/json",
            "User-Agent": "AgentBeacon-Py/1.0.0 (Nymrel)",
        }
        if headers:
            req_headers.update(headers)

        payload_bytes = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=payload_bytes, headers=req_headers, method="POST")

        with urllib.request.urlopen(req, timeout=8.0) as resp:
            resp.read()


class ConsoleNotifier(BaseNotifier):
    """Terminal notifier with ANSI colors and optional bell."""

    def __init__(self, audible_bell: bool = True, enabled_events: Optional[List[str]] = None):
        super().__init__(enabled_events)
        self.audible_bell = audible_bell

    def notify(self, event: BeaconEvent) -> None:
        if not self.should_notify(event):
            return

        time_str = time.strftime("%H:%M:%S", time.localtime(event.timestamp))
        agent_id = event.agent_id
        name_str = f" ({event.agent.name})" if event.agent.name != agent_id else ""
        bell = "\a" if (self.audible_bell and event.type == "agent:dead") else ""

        badges = {
            "agent:dead": "\033[41m\033[37m\033[1m DEAD \033[0m",
            "agent:recovered": "\033[42m\033[30m\033[1m RECOVERED \033[0m",
            "agent:degraded": "\033[43m\033[30m\033[1m DEGRADED \033[0m",
            "agent:registered": "\033[46m\033[30m\033[1m REGISTERED \033[0m",
            "agent:deregistered": "\033[100m\033[37m\033[1m RETIRED \033[0m",
        }
        badge = badges.get(event.type, f"\033[7m {event.type.upper()} \033[0m")
        reason = f" \033[90m— {event.reason}\033[0m" if event.reason else ""

        sys.stdout.write(f"\033[90m[{time_str}]\033[0m {badge} \033[1m{agent_id}\033[0m{name_str}{reason}{bell}\n")
        sys.stdout.flush()


class DiscordNotifier(BaseNotifier):
    """Dispatches embed cards to Discord webhooks."""

    def __init__(self, webhook_url: str, username: str = "Agent Beacon Sentinel", enabled_events: Optional[List[str]] = None):
        super().__init__(enabled_events)
        self.webhook_url = webhook_url
        self.username = username

    def notify(self, event: BeaconEvent) -> None:
        if not self.should_notify(event):
            return

        colors = {
            "agent:dead": 0xE74C3C,  # Red
            "agent:recovered": 0x2ECC71,  # Green
            "agent:degraded": 0xF1C40F,  # Yellow
            "agent:registered": 0x3498DB,  # Blue
            "agent:deregistered": 0x7F8C8D,  # Gray
        }

        titles = {
            "agent:dead": "🚨 CRITICAL: Agent Dead-Man's Switch Triggered",
            "agent:recovered": "✅ RECOVERY: Agent Resumed Heartbeats",
            "agent:degraded": "⚠️ WARNING: Agent Heartbeat Degraded",
            "agent:registered": "📡 NEW AGENT: Heartbeat Sentinel Registered",
            "agent:deregistered": "🏁 RETIRED: Agent Completed Work Gracefully",
        }

        agent = event.agent
        fields = [
            {"name": "Agent ID", "value": f"`{agent.id}`", "inline": True},
            {"name": "Display Name", "value": agent.name, "inline": True},
            {"name": "Status", "value": f"**{agent.status.value}**", "inline": True},
            {"name": "TTL / Grace", "value": f"{agent.ttl_sec}s / {agent.grace_sec}s", "inline": True},
            {"name": "Total Pings", "value": str(agent.total_pings), "inline": True},
        ]
        if event.reason:
            fields.insert(0, {"name": "Details", "value": event.reason, "inline": False})

        payload = {
            "username": self.username,
            "embeds": [
                {
                    "title": titles.get(event.type, f"[Agent Beacon] {event.type}"),
                    "color": colors.get(event.type, 0x95A5A6),
                    "fields": fields,
                    "footer": {"text": "Agent Beacon • Nymrel Autonomous Mesh"},
                }
            ],
        }

        try:
            self._post_json(self.webhook_url, payload)
        except Exception:
            pass


class SlackNotifier(BaseNotifier):
    """Dispatches formatted message blocks to Slack incoming webhooks."""

    def __init__(self, webhook_url: str, username: str = "Agent Beacon", enabled_events: Optional[List[str]] = None):
        super().__init__(enabled_events)
        self.webhook_url = webhook_url
        self.username = username

    def notify(self, event: BeaconEvent) -> None:
        if not self.should_notify(event):
            return

        agent = event.agent
        header = f"[Agent Beacon] {event.type.upper()} — {agent.name} ({agent.id})"
        color = "#danger" if event.type == "agent:dead" else ("#good" if event.type == "agent:recovered" else "#warning")

        payload = {
            "username": self.username,
            "text": header,
            "attachments": [
                {
                    "color": color,
                    "title": header,
                    "fields": [
                        {"title": "Agent ID", "value": f"`{agent.id}`", "short": True},
                        {"title": "Status", "value": agent.status.value, "short": True},
                        {"title": "Details", "value": event.reason or "No details", "short": False},
                    ],
                    "footer": "Agent Beacon • Nymrel",
                }
            ],
        }
        try:
            self._post_json(self.webhook_url, payload)
        except Exception:
            pass


class TelegramNotifier(BaseNotifier):
    """Dispatches Telegram alerts via Bot API."""

    def __init__(self, bot_token: str, chat_id: str | int, enabled_events: Optional[List[str]] = None):
        super().__init__(enabled_events)
        self.bot_token = bot_token
        self.chat_id = str(chat_id)

    def notify(self, event: BeaconEvent) -> None:
        if not self.should_notify(event):
            return

        agent = event.agent
        text = (
            f"📡 *[Agent Beacon]* `{event.type}`\n"
            f"*Agent:* `{agent.id}` ({agent.name})\n"
            f"*Status:* *{agent.status.value}*\n"
            f"*Pings:* {agent.total_pings}\n"
        )
        if event.reason:
            text += f"*Reason:* {event.reason}\n"

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            self._post_json(url, {"chat_id": self.chat_id, "text": text, "parse_mode": "Markdown"})
        except Exception:
            pass


class WebhookNotifier(BaseNotifier):
    """Generic JSON webhook with optional HMAC signature."""

    def __init__(self, url: str, secret: Optional[str] = None, headers: Optional[Dict[str, str]] = None, enabled_events: Optional[List[str]] = None):
        super().__init__(enabled_events)
        self.url = url
        self.secret = secret
        self.custom_headers = headers or {}

    def notify(self, event: BeaconEvent) -> None:
        if not self.should_notify(event):
            return

        payload = {
            "event": event.type,
            "timestamp": int(event.timestamp * 1000),
            "agentId": event.agent_id,
            "status": event.agent.status.value,
            "agent": event.agent.to_dict(),
            "reason": event.reason,
        }

        headers = dict(self.custom_headers)
        if self.secret:
            data_bytes = json.dumps(payload).encode("utf-8")
            sig = hmac.new(self.secret.encode("utf-8"), data_bytes, hashlib.sha256).hexdigest()
            headers["X-Beacon-Signature-256"] = f"sha256={sig}"

        try:
            self._post_json(self.url, payload, headers)
        except Exception:
            pass
