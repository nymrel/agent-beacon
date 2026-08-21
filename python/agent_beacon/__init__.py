"""
Agent Beacon
~~~~~~~~~~~~
Zero-dependency liveness sentinel, heartbeat monitor, and dead-man's switch watchdog for autonomous AI agents.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from .core import (
    AgentStatus,
    HeartbeatPayload,
    StatusTransition,
    AgentRecord,
    BeaconEvent,
    HeartbeatStore,
    Watchdog,
)
from .notifiers import (
    BaseNotifier,
    ConsoleNotifier,
    DiscordNotifier,
    SlackNotifier,
    TelegramNotifier,
    WebhookNotifier,
)
from .client import BeaconClient, beacon_watch
from .server import BeaconServer, BeaconRequestHandler, BeaconUdpServer

__version__ = "1.0.0"
__author__ = "Nymrel / JalenBuilds LLC <contact@jalenbuilds.com>"

__all__ = [
    "AgentStatus",
    "HeartbeatPayload",
    "StatusTransition",
    "AgentRecord",
    "BeaconEvent",
    "HeartbeatStore",
    "Watchdog",
    "BaseNotifier",
    "ConsoleNotifier",
    "DiscordNotifier",
    "SlackNotifier",
    "TelegramNotifier",
    "WebhookNotifier",
    "BeaconClient",
    "beacon_watch",
    "BeaconServer",
    "BeaconRequestHandler",
    "BeaconUdpServer",
]
