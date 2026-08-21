#!/usr/bin/env python3
"""Setup script for agent-beacon."""
from setuptools import setup, find_packages
import os

long_description = ""
if os.path.exists("README.md"):
    with open("README.md", encoding="utf-8") as f:
        long_description = f.read()

setup(
    name="agent-beacon",
    version="1.0.0",
    description="Zero-dependency liveness sentinel and watchdog mesh for autonomous AI agents",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Nymrel / JalenBuilds LLC",
    author_email="contact@nymrel.com",
    url="https://github.com/nymrel/agent-beacon",
    package_dir={"": "python"},
    packages=find_packages(where="python"),
    python_requires=">=3.9",
    install_requires=[],
    entry_points={
        "console_scripts": [
            "agent-beacon-py=agent_beacon.cli:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Topic :: System :: Monitoring",
    ],
)
