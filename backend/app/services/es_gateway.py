"""ES 网关：只读查询执行 + DSL 安全校验 + 聚合限制。"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from app.config import settings
from app.services.es_client import get_es_client

# 仅允许出现的顶层字段（白名单）
_ALLOWED_TOP_KEYS = {
    "query", "sort", "size", "from", "_source", "aggs", "aggregations",
    "collapse", "post_filter", "highlight", "track_total_hits",
    "fields", "search_after",
}

# 高危查询类型/脚本入口，禁止出现在 DSL 任意嵌套层级。
# 特别是 script/_script 可能执行 Painless；has_child/has_parent 可能触发
# 跨索引关系查询，统一禁用以避免绕过资源与权限边界。
_FORBIDDEN_QUERY_TYPES = {
    "script", "_script", "script_fields", "runtime_mappings",
    "percolate", "join", "terms_set", "has_child", "has_parent",
}

_DEFAULT_QUERY_SIZE = 100
_MAX_AGG_DEPTH = 3
_MAX_AGG_BUCKETS = 100
_MAX_AGG_BUCKET_SIZE = 1000


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

    max_size = settings.es_max_size if max_size is None else max_size
    if not isinstance(max_size, int) or isinstance(max_size, bool) or max_size < 0:
        raise DSLSecurityError("size 上限配置无效")

    for key in dsl.keys():
        if key not in _ALLOWED_TOP_KEYS:
            raise DSLSecurityError(f"不允许的 DSL 字段: {key}")

    size = dsl.get("size")
    if size is not None:
        if isinstance(size, bool):
            raise DSLSecurityError("size 必须是整数")
        try:
            size = int(size)
        except (TypeError, ValueError):
            raise DSLSecurityError("size 必须是整数")
        if size < 0:
            raise DSLSecurityError("size 不能为负数")
        if size > max_size:
            raise DSLSecurityError(f"size 超过上限 {max_size}")
    else:
        # 与 API/前端保持一致：未指定 size 时默认返回 100 条。
        dsl["size"] = min(_DEFAULT_QUERY_SIZE, max_size)

    from_value = dsl.get("from")
    if from_value is not None:
        if isinstance(from_value, bool):
            raise DSLSecurityError("from 必须是非负整数")
        try:
            from_value = int(from_value)
        except (TypeError, ValueError):
            raise DSLSecurityError("from 必须是非负整数")
        if from_value < 0:
            raise DSLSecurityError("from 必须是非负整数")

    # 必须遍历整个 DSL，并递归进入 list；否则 bool.must / should 等列表中
    # 的 script 会被漏检，从而绕过安全校验。
    _check_node(dsl, path="dsl")
    _check_aggs(dsl.get("aggs") or dsl.get("aggregations"), path="aggs")

    return dsl


def _check_node(node: Any, path: str) -> None:
    if isinstance(node, list):
        for i, item in enumerate(node):
            _check_node(item, path=f"{path}[{i}]")
        return
    if not isinstance(node, dict):
        return
    for k, v in node.items():
        if k in _FORBIDDEN_QUERY_TYPES:
            raise DSLSecurityError(f"禁止的查询类型: {k} (路径 {path})")
        _check_node(v, path=f"{path}.{k}")


def _check_aggs(aggs: Any, path: str, depth: int = 0) -> None:
    if not isinstance(aggs, dict):
        return
    if depth > _MAX_AGG_DEPTH:
        raise DSLSecurityError(f"聚合嵌套层数过多（最多 {_MAX_AGG_DEPTH} 层）")
    if len(aggs) > _MAX_AGG_BUCKETS:
        raise DSLSecurityError(f"聚合数量过多（每层最多 {_MAX_AGG_BUCKETS} 个）")
    for name, spec in aggs.items():
        if not isinstance(spec, dict):
            continue
        for agg_type, agg_body in spec.items():
            if agg_type not in {"terms", "composite", "significant_terms", "rare_terms"}:
                continue
            if not isinstance(agg_body, dict):
                continue
            for size_key in ("size", "shard_size"):
                bucket_size = agg_body.get(size_key)
                if bucket_size is None:
                    continue
                if isinstance(bucket_size, bool):
                    raise DSLSecurityError(f"聚合 {size_key} 必须是非负整数")
                try:
                    bucket_size = int(bucket_size)
                except (TypeError, ValueError):
                    raise DSLSecurityError(f"聚合 {size_key} 必须是非负整数")
                if bucket_size < 0 or bucket_size > _MAX_AGG_BUCKET_SIZE:
                    raise DSLSecurityError(
                        f"聚合 {size_key} 超出范围（0-{_MAX_AGG_BUCKET_SIZE}）"
                    )
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
