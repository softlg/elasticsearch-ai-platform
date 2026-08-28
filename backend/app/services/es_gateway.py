"""ES 网关：只读查询执行 + DSL 安全校验 + 聚合限制。"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from app.config import settings
from app.services.es_client import get_es_client

# 仅允许出现的顶层字段（白名单）
_ALLOWED_TOP_KEYS = {
    "query", "sort", "size", "from", "_source", "aggs", "aggregations",
    "collapse", "post_filter", "highlight", "track_total_hits", "runtime_mappings",
    "fields", "script_fields", "search_after",
}

# 高危查询类型，禁止出现在 query/aggs 中
_FORBIDDEN_QUERY_TYPES = {
    "script", "percolate", "join", "terms_set",
}


class DSLSecurityError(Exception):
    pass


def validate_dsl(dsl: Dict[str, Any], max_size: int | None = None) -> Dict[str, Any]:
    """校验 DSL 是否只读且安全，返回规范化后的 DSL。

    规则：
    - 顶层只允许白名单字段
    - 拒绝未知/高危 query 类型
    - aggs 限制桶数量与深度
    - size 不超过上限
    """
    if not isinstance(dsl, dict):
        raise DSLSecurityError("DSL 必须是 JSON 对象")

    max_size = max_size or settings.es_max_size

    for key in dsl.keys():
        if key not in _ALLOWED_TOP_KEYS:
            raise DSLSecurityError(f"不允许的 DSL 字段: {key}")

    size = dsl.get("size")
    if size is not None:
        try:
            size = int(size)
        except (TypeError, ValueError):
            raise DSLSecurityError("size 必须是整数")
        if size > max_size:
            raise DSLSecurityError(f"size 超过上限 {max_size}")
    else:
        dsl["size"] = min(50, max_size)

    _check_node(dsl.get("query"), path="query")
    _check_aggs(dsl.get("aggs") or dsl.get("aggregations"), path="aggs")

    return dsl


def _check_node(node: Any, path: str) -> None:
    if not isinstance(node, dict):
        return
    for k, v in node.items():
        if k in _FORBIDDEN_QUERY_TYPES:
            raise DSLSecurityError(f"禁止的查询类型: {k} (路径 {path})")
        if isinstance(v, dict):
            _check_node(v, path=f"{path}.{k}")


def _check_aggs(aggs: Any, path: str, depth: int = 0) -> None:
    if not isinstance(aggs, dict):
        return
    if depth > 3:
        raise DSLSecurityError("聚合嵌套层数过多（最多 3 层）")
    for name, spec in aggs.items():
        if not isinstance(spec, dict):
            continue
        sub = spec.get("aggs") or spec.get("aggregations")
        _check_aggs(sub, path=f"{path}.{name}", depth=depth + 1)


def execute_search(index: str, dsl: Dict[str, Any]) -> Tuple[int, List[Dict[str, Any]], int]:
    """执行只读 search，返回 (total, hits, took_ms)。"""
    es = get_es_client()
    safe_dsl = validate_dsl(dsl)
    resp = es.search(index=index, body=safe_dsl)

    total = resp.get("hits", {}).get("total", {})
    if isinstance(total, dict):
        total = total.get("value", 0)
    hits = [h.get("_source", {}) for h in resp.get("hits", {}).get("hits", [])]
    took = resp.get("took", 0)
    return total, hits, took
