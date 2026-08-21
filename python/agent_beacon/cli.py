"""
agent_beacon.cli
~~~~~~~~~~~~~~~~
Command-line interface for Agent Beacon in Python.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
try:
    from .core import AgentStatus
    from .notifiers import ConsoleNotifier, DiscordNotifier, SlackNotifier, TelegramNotifier, WebhookNotifier
    from .server import BeaconServer
except (ImportError, ValueError):
    import os
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from agent_beacon.core import AgentStatus
    from agent_beacon.notifiers import ConsoleNotifier, DiscordNotifier, SlackNotifier, TelegramNotifier, WebhookNotifier
    from agent_beacon.server import BeaconServer


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agent-beacon",
        description="Zero-dependency liveness sentinel & watchdog mesh for AI agents (Python Engine)",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Subcommand: server
    srv = subparsers.add_parser("server", help="Start standalone beacon daemon")
    srv.add_argument("--port", "-p", type=int, default=8765, help="HTTP port (default: 8765)")
    srv.add_argument("--udp", "-u", type=int, default=8766, help="UDP port (default: 8766, 0 to disable)")
    srv.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    srv.add_argument("--ttl", type=float, default=30.0, help="Default agent TTL in seconds")
    srv.add_argument("--grace", type=float, default=15.0, help="Default grace window in seconds")
    srv.add_argument("--discord", help="Discord webhook URL")
    srv.add_argument("--slack", help="Slack incoming webhook URL")
    srv.add_argument("--telegram", help="Telegram bot token:chat_id")
    srv.add_argument("--webhook", help="Generic HTTP webhook URL")
    srv.add_argument("--no-bell", action="store_true", help="Disable console audible bell")

    # Subcommand: ping
    png = subparsers.add_parser("ping", help="Send a one-shot heartbeat ping")
    png.add_argument("--id", "-i", required=True, help="Agent unique ID")
    png.add_argument("--name", "-n", help="Agent display name")
    png.add_argument("--url", default="http://127.0.0.1:8765", help="Beacon server URL")
    png.add_argument("--ttl", type=float, help="TTL in seconds")
    png.add_argument("--grace", type=float, help="Grace window in seconds (DEGRADED before DEAD)")
    png.add_argument("--status", default="ok", choices=["ok", "degraded"], help="Health status")

    # Subcommand: done
    don = subparsers.add_parser("done", help="Gracefully retire an agent")
    don.add_argument("--id", "-i", required=True, help="Agent unique ID")
    don.add_argument("--url", default="http://127.0.0.1:8765", help="Beacon server URL")
    don.add_argument("--reason", default="Agent completed work", help="Retirement reason")

    # Subcommand: status
    stat = subparsers.add_parser("status", help="Query fleet status")
    stat.add_argument("--url", default="http://127.0.0.1:8765", help="Beacon server URL")
    stat.add_argument("--json", action="store_true", help="Output raw JSON")

    args = parser.parse_args()

    # Windows redirected/pipe stdout often defaults to a legacy codepage (e.g. cp1252)
    # that cannot encode the ANSI box-drawing banner. Reconfigure to UTF-8 with
    # replacement so the daemon never dies on cosmetic output.
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "server":
        handle_server(args)
    elif args.command == "ping":
        handle_ping(args)
    elif args.command == "done":
        handle_done(args)
    elif args.command == "status":
        handle_status(args)


def handle_server(args: argparse.Namespace) -> None:
    notifiers = [ConsoleNotifier(audible_bell=not args.no_bell)]

    if args.discord:
        notifiers.append(DiscordNotifier(webhook_url=args.discord))
    if args.slack:
        notifiers.append(SlackNotifier(webhook_url=args.slack))
    if args.telegram:
        parts = args.telegram.split(":")
        if len(parts) >= 2:
            notifiers.append(TelegramNotifier(bot_token=parts[0], chat_id=":".join(parts[1:])))
    if args.webhook:
        notifiers.append(WebhookNotifier(url=args.webhook))

    udp_port = None if args.udp == 0 else args.udp
    server = BeaconServer(
        host=args.host,
        http_port=args.port,
        udp_port=udp_port,
        default_ttl_sec=args.ttl,
        default_grace_sec=args.grace,
        notifiers=notifiers,
    )

    actual_http, actual_udp = server.start()

    sys.stdout.write(
        f"\n\033[1m\033[36m╭──────────────────────────────────────────────────────────╮\033[0m\n"
        f"\033[1m\033[36m│\033[0m  \033[1m\033[32mAGENT BEACON DAEMON ONLINE (PYTHON)\033[0m                     \033[1m\033[36m│\033[0m\n"
        f"\033[1m\033[36m│\033[0m  \033[90mOperating under Nymrel -> JalenBuilds LLC               \033[1m\033[36m│\033[0m\n"
        f"\033[1m\033[36m├──────────────────────────────────────────────────────────┤\033[0m\n"
        f"\033[1m\033[36m│\033[0m  HTTP Endpoint:  \033[1mhttp://{args.host}:{actual_http}\033[0m\n"
        f"\033[1m\033[36m│\033[0m  UDP Socket:     \033[1m{'udp://' + args.host + ':' + str(actual_udp) if actual_udp else 'Disabled'}\033[0m\n"
        f"\033[1m\033[36m│\033[0m  Default TTL:    {args.ttl}s (Grace: {args.grace}s)\n"
        f"\033[1m\033[36m╰──────────────────────────────────────────────────────────╯\033[0m\n\n"
    )
    sys.stdout.flush()

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nStopping Agent Beacon server...")
        server.stop()


def handle_ping(args: argparse.Namespace) -> None:
    url = args.url.rstrip("/") + "/ping"
    payload = {
        "id": args.id,
        "name": args.name or args.id,
        "ttlSec": args.ttl,
        "graceSec": args.grace,
        "status": args.status,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            resp.read()
        print(f"\033[32m✓\033[0m Heartbeat registered for agent '{args.id}'")
    except Exception as exc:
        print(f"\033[31m✗\033[0m Failed to ping beacon at {url}: {exc}")
        sys.exit(1)


def handle_done(args: argparse.Namespace) -> None:
    url = args.url.rstrip("/") + "/deregister"
    payload = {"id": args.id, "reason": args.reason}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            resp.read()
        print(f"\033[32m✓\033[0m Agent '{args.id}' gracefully retired")
    except Exception as exc:
        print(f"\033[31m✗\033[0m Failed to deregister agent at {url}: {exc}")
        sys.exit(1)


def handle_status(args: argparse.Namespace) -> None:
    url = args.url.rstrip("/") + "/status"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AgentBeaconCLI/1.0.0"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)

        if args.json:
            print(json.dumps(data, indent=2))
            return

        s = data.get("summary", data)
        print(f"\n\033[1m\033[36mAGENT BEACON FLEET STATUS\033[0m [{args.url}]")
        print("─────────────────────────────────────────────────────────────────────────────")
        print(
            f"  Total: {s.get('total', 0)}   "
            f"\033[32mHealthy:\033[0m {s.get('healthy', 0)}   "
            f"\033[33mDegraded:\033[0m {s.get('degraded', 0)}   "
            f"\033[31mDead:\033[0m {s.get('dead', 0)}   "
            f"\033[90mRetired:\033[0m {s.get('deregistered', 0)}"
        )
        print("─────────────────────────────────────────────────────────────────────────────\n")
    except Exception as exc:
        print(f"Failed to query beacon at {url}: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
