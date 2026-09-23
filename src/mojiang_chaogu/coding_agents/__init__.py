"""Coding Agent adapters used by ``mojiang connect``."""

from typing import Any, cast

from mojiang_chaogu.coding_agents.base import (
    CodingAgentAdapter,
    ConnectionSpec,
    ConnectionStatus,
)
from mojiang_chaogu.coding_agents.claude import ClaudeAdapter
from mojiang_chaogu.coding_agents.cline import ClineAdapter
from mojiang_chaogu.coding_agents.codex import CodexAdapter
from mojiang_chaogu.coding_agents.dsh import DshAdapter
from mojiang_chaogu.coding_agents.kimi import KimiAdapter


def adapter_for(target: str, **kwargs: Any) -> CodingAgentAdapter:
    adapters: dict[str, Any] = {
        "claude": ClaudeAdapter,
        "kimi": KimiAdapter,
        "cline": ClineAdapter,
        "codex": CodexAdapter,
        "dsh": DshAdapter,
    }
    try:
        return cast(CodingAgentAdapter, adapters[target](target=target, **kwargs))
    except KeyError as exc:
        raise ValueError(f"未知 Coding Agent: {target}") from exc


__all__ = [
    "ClaudeAdapter",
    "ClineAdapter",
    "CodexAdapter",
    "CodingAgentAdapter",
    "ConnectionSpec",
    "ConnectionStatus",
    "DshAdapter",
    "KimiAdapter",
    "adapter_for",
]
