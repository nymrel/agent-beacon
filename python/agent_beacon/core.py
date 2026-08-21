"""
agent_beacon.core
~~~~~~~~~~~~~~~~~
Core data structures, in-memory store, and dead-man's switch watchdog for Python.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
import threading
import time
from typing import Any, Callable, Dict, List, Optional


class AgentStatus(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DEAD = "DEAD"
    RECOVERED = "RECOVERED"
    DEREGISTERED = "DEREGISTERED"


@dataclass
class HeartbeatPayload:
    id: str
    name: Optional[str] = None
    ttl_sec: Optional[float] = None
    grace_sec: Optional[float] = None
    seq: Optional[int] = None
    timestamp: Optional[float] = None
    status: str = "ok"
    metrics: Dict[str, Any] = field(default_factory=dict)
    tags: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StatusTransition:
    timestamp: float
    from_status: AgentStatus
    to_status: AgentStatus
    reason: Optional[str] = None


@dataclass
class AgentRecord:
    id: str
    name: str
    status: AgentStatus
    last_ping_at: float
    first_seen_at: float
    ttl_sec: float
    grace_sec: float
    seq: int
    consecutive_misses: int
    total_pings: int
    last_payload: HeartbeatPayload
    tags: Dict[str, str]
    history: List[StatusTransition] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        now = time.time()
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "lastPingAt": int(self.last_ping_at * 1000),
            "lastPingAgeSec": max(0.0, round(now - self.last_ping_at, 1)),
            "firstSeenAt": int(self.first_seen_at * 1000),
            "ttlSec": self.ttl_sec,
            "graceSec": self.grace_sec,
            "seq": self.seq,
            "consecutiveMisses": self.consecutive_misses,
            "totalPings": self.total_pings,
            "tags": self.tags,
            "history": [
                {
                    "timestamp": int(h.timestamp * 1000),
                    "from": h.from_status.value,
                    "to": h.to_status.value,
                    "reason": h.reason,
                }
                for h in self.history
            ],
        }


@dataclass
class BeaconEvent:
    type: str
    agent_id: str
    timestamp: float
    agent: AgentRecord
    previous_status: Optional[AgentStatus] = None
    reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class HeartbeatStore:
    """In-memory thread-safe storage for agent liveness records."""

    def __init__(self, default_ttl_sec: float = 30.0, default_grace_sec: float = 15.0, history_limit: int = 50):
        self.default_ttl_sec = default_ttl_sec
        self.default_grace_sec = default_grace_sec
        self.history_limit = history_limit
        self._records: Dict[str, AgentRecord] = {}
        self._lock = threading.RLock()

    def register_or_update(self, payload: HeartbeatPayload) -> tuple[AgentRecord, bool, Optional[AgentStatus], bool]:
        now = time.time()
        agent_id = payload.id.strip()
        if not agent_id:
            raise ValueError("Heartbeat payload missing required non-empty 'id'")

        ttl_sec = payload.ttl_sec if payload.ttl_sec is not None else self.default_ttl_sec
        grace_sec = payload.grace_sec if payload.grace_sec is not None else self.default_grace_sec
        name = payload.name.strip() if payload.name and payload.name.strip() else agent_id

        with self._lock:
            existing = self._records.get(agent_id)
            if not existing:
                initial_status = AgentStatus.DEGRADED if payload.status == "degraded" else AgentStatus.HEALTHY
                record = AgentRecord(
                    id=agent_id,
                    name=name,
                    status=initial_status,
                    last_ping_at=now,
                    first_seen_at=now,
                    ttl_sec=ttl_sec,
                    grace_sec=grace_sec,
                    seq=payload.seq if payload.seq is not None else 1,
                    consecutive_misses=0,
                    total_pings=1,
                    last_payload=payload,
                    tags=dict(payload.tags),
                    history=[
                        StatusTransition(
                            timestamp=now,
                            from_status=AgentStatus.DEREGISTERED,
                            to_status=initial_status,
                            reason="Initial registration",
                        )
                    ],
                )
                self._records[agent_id] = record
                return record, True, None, True

            previous_status = existing.status
            target_status = AgentStatus.DEGRADED if payload.status == "degraded" else AgentStatus.HEALTHY
            status_changed = previous_status != target_status

            existing.name = name
            existing.last_ping_at = now
            existing.ttl_sec = ttl_sec
            existing.grace_sec = grace_sec
            existing.seq = payload.seq if payload.seq is not None else (existing.seq + 1)
            existing.consecutive_misses = 0
            existing.total_pings += 1
            existing.last_payload = payload
            if payload.tags:
                existing.tags.update(payload.tags)

            if status_changed:
                existing.status = target_status
                transition = StatusTransition(
                    timestamp=now,
                    from_status=previous_status,
                    to_status=target_status,
                    reason="Agent revived" if previous_status == AgentStatus.DEAD else "Heartbeat received",
                )
                existing.history.append(transition)
                if len(existing.history) > self.history_limit:
                    existing.history.pop(0)

            return existing, False, previous_status, status_changed

    def update_status(self, agent_id: str, new_status: AgentStatus, reason: Optional[str] = None) -> Optional[tuple[AgentRecord, AgentStatus]]:
        with self._lock:
            record = self._records.get(agent_id)
            if not record or record.status == new_status:
                return None

            previous = record.status
            record.status = new_status
            record.history.append(
                StatusTransition(
                    timestamp=time.time(),
                    from_status=previous,
                    to_status=new_status,
                    reason=reason,
                )
            )
            if len(record.history) > self.history_limit:
                record.history.pop(0)
            return record, previous

    def deregister(self, agent_id: str, reason: str = "Gracefully retired") -> Optional[AgentRecord]:
        with self._lock:
            record = self._records.get(agent_id)
            if not record:
                return None
            previous = record.status
            record.status = AgentStatus.DEREGISTERED
            record.history.append(
                StatusTransition(
                    timestamp=time.time(),
                    from_status=previous,
                    to_status=AgentStatus.DEREGISTERED,
                    reason=reason,
                )
            )
            return record

    def get(self, agent_id: str) -> Optional[AgentRecord]:
        with self._lock:
            return self._records.get(agent_id)

    def list(self) -> List[AgentRecord]:
        with self._lock:
            return list(self._records.values())

    def clear(self) -> None:
        with self._lock:
            self._records.clear()

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            now = time.time()
            all_records = list(self._records.values())
            healthy = sum(1 for r in all_records if r.status in (AgentStatus.HEALTHY, AgentStatus.RECOVERED))
            degraded = sum(1 for r in all_records if r.status == AgentStatus.DEGRADED)
            dead = sum(1 for r in all_records if r.status == AgentStatus.DEAD)
            deregistered = sum(1 for r in all_records if r.status == AgentStatus.DEREGISTERED)

            return {
                "timestamp": int(now * 1000),
                "total": len(all_records),
                "healthy": healthy,
                "degraded": degraded,
                "dead": dead,
                "deregistered": deregistered,
                "agents": [r.to_dict() for r in all_records],
            }


class Watchdog:
    """Evaluates TTL deadlines and dispatches events to registered listeners/notifiers."""

    def __init__(self, store: HeartbeatStore, check_interval_sec: float = 1.0):
        self.store = store
        self.check_interval_sec = check_interval_sec
        self._notifiers: List[Any] = []
        self._listeners: List[Callable[[BeaconEvent], None]] = []
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def add_notifier(self, notifier: Any) -> Watchdog:
        self._notifiers.append(notifier)
        return self

    def add_listener(self, listener: Callable[[BeaconEvent], None]) -> Watchdog:
        self._listeners.append(listener)
        return self

    def start(self) -> Watchdog:
        if self._running:
            return self
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> Watchdog:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        return self

    def record_ping(self, payload: HeartbeatPayload) -> AgentRecord:
        record, is_new, prev_status, status_changed = self.store.register_or_update(payload)
        now = time.time()

        if is_new:
            event = BeaconEvent(
                type="agent:registered",
                agent_id=record.id,
                timestamp=now,
                agent=record,
            )
            self._emit(event)
        elif status_changed:
            if prev_status == AgentStatus.DEAD:
                event = BeaconEvent(
                    type="agent:recovered",
                    agent_id=record.id,
                    timestamp=now,
                    agent=record,
                    previous_status=prev_status,
                    reason=f"Agent '{record.name}' resumed heartbeats after dead state",
                )
                self._emit(event)
            elif record.status == AgentStatus.HEALTHY:
                event = BeaconEvent(
                    type="agent:healthy",
                    agent_id=record.id,
                    timestamp=now,
                    agent=record,
                    previous_status=prev_status,
                )
                self._emit(event)

        return record

    def deregister(self, agent_id: str, reason: str = "Gracefully retired") -> Optional[AgentRecord]:
        record = self.store.deregister(agent_id, reason)
        if not record:
            return None

        event = BeaconEvent(
            type="agent:deregistered",
            agent_id=record.id,
            timestamp=time.time(),
            agent=record,
            reason=reason,
        )
        self._emit(event)
        return record

    def check_liveness(self) -> None:
        now = time.time()
        for record in self.store.list():
            if record.status == AgentStatus.DEREGISTERED:
                continue

            elapsed = now - record.last_ping_at
            dead_deadline = record.ttl_sec + record.grace_sec

            if elapsed > dead_deadline:
                if record.status != AgentStatus.DEAD:
                    res = self.store.update_status(
                        record.id,
                        AgentStatus.DEAD,
                        f"Dead-man's switch triggered: unresponsive for {int(elapsed)}s",
                    )
                    if res:
                        record.consecutive_misses += 1
                        event = BeaconEvent(
                            type="agent:dead",
                            agent_id=record.id,
                            timestamp=now,
                            agent=record,
                            previous_status=res[1],
                            reason=f"DEAD-MAN'S SWITCH: Agent '{record.name}' is dead ({int(elapsed)}s without ping)",
                        )
                        self._emit(event)
            elif elapsed > record.ttl_sec:
                if record.status == AgentStatus.HEALTHY:
                    res = self.store.update_status(
                        record.id,
                        AgentStatus.DEGRADED,
                        f"Missed TTL ({int(elapsed)}s > {int(record.ttl_sec)}s)",
                    )
                    if res:
                        event = BeaconEvent(
                            type="agent:degraded",
                            agent_id=record.id,
                            timestamp=now,
                            agent=record,
                            previous_status=res[1],
                            reason=f"Agent '{record.name}' is DEGRADED. Last seen {int(elapsed)}s ago",
                        )
                        self._emit(event)

    def _run_loop(self) -> None:
        while self._running:
            try:
                self.check_liveness()
            except Exception:
                pass
            time.sleep(self.check_interval_sec)

    def _emit(self, event: BeaconEvent) -> None:
        for listener in list(self._listeners):
            try:
                listener(event)
            except Exception:
                pass

        for notifier in list(self._notifiers):
            try:
                notifier.notify(event)
            except Exception:
                pass
