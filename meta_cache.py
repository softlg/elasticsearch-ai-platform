"""索引与 mapping 元数据短时缓存，减少 ES 元数据请求压力。"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

_TTL = 60  # 秒

_cache: Dict[str, tuple[float, Any]] = {}


def get(key: str) -> Optional[Any]:
    item = _cache.get(key)
    if item is None:
        return None
    ts, value = item
    if time.time() - ts > _TTL:
        _cache.pop(key, None)
        return None
    return value


def set(key: str, value: Any) -> None:
    _cache[key] = (time.time(), value)


def clear() -> None:
    _cache.clear()
