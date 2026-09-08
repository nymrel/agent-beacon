"""Shared validation for outbound HTTP targets."""

from __future__ import annotations

from urllib.parse import urlparse


def require_http_url(value: str, label: str = "URL") -> str:
    """Return a validated absolute HTTP(S) URL without embedded credentials."""
    candidate = value.strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{label} must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        raise ValueError(f"{label} must not contain embedded credentials")
    return candidate


def normalize_http_base_url(value: str, label: str = "Base URL") -> str:
    """Validate a base URL that will have fixed endpoint paths appended."""
    candidate = require_http_url(value, label)
    parsed = urlparse(candidate)
    if parsed.query or parsed.fragment:
        raise ValueError(f"{label} must not contain a query string or fragment")
    return candidate.rstrip("/")
