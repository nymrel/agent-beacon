#!/usr/bin/env python3
"""
Agent Beacon setup script.
Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
"""

from setuptools import setup, find_packages

setup(
    name="agent-beacon",
    version="1.0.0",
    description="Zero-dependency liveness sentinel and watchdog mesh for autonomous AI agents",
    author="Nymrel",
    author_email="contact@nymrel.com",
    packages=find_packages(),
    python_requires=">=3.9",
    entry_points={
        "console_scripts": [
            "agent-beacon=agent_beacon.cli:main",
        ],
    },
)
