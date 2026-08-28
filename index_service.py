"""索引发现与 mapping 探测（带缓存）。"""
from __future__ import annotations

from typing import Dict, List

from app.cache.meta_cache import get as cache_get, set as cache_set
from app.services.es_client import get_es_client
from app.schemas.models import IndexInfo, IndexMapping, MappingField


def list_indices() -> List[IndexInfo]:
    key = "indices"
    cached = cache_get(key)
    if cached is not None:
        return cached

    es = get_es_client()
    try:
        resp = es.cat.indices(format="json")
    except Exception:
        # 某些集群禁用了 cat，退化到 _all 别名
        resp = []
    result: List[IndexInfo] = []
    for item in resp:
        result.append(
            IndexInfo(
                name=item.get("index", ""),
                health=item.get("health"),
                docs_count=_to_int(item.get("docs.count")),
                store_size=item.get("store.size"),
            )
        )
    result.sort(key=lambda x: x.name)
    cache_set(key, result)
    return result


def get_mapping(index: str) -> IndexMapping:
    # 支持逗号拼接的多索引（来自"全部日期"选项）：取第一个真实索引的 mapping
    first_index = index.split(",")[0].strip()
    key = f"mapping:{first_index}"
    cached = cache_get(key)
    if cached is not None:
        return cached

    es = get_es_client()
    raw = es.indices.get_mapping(index=first_index)
    fields: List[MappingField] = []
    for idx, body in raw.items():
        props = body.get("mappings", {}).get("properties", {})
        fields = _flatten(props)

    mapping = IndexMapping(index=index, fields=fields)
    cache_set(key, mapping)
    return mapping


def _flatten(props: Dict, prefix: str = "") -> List[MappingField]:
    out: List[MappingField] = []
    for name, spec in props.items():
        full = f"{prefix}{name}"
        if isinstance(spec, dict) and "properties" in spec:
            out.extend(_flatten(spec["properties"], prefix=f"{full}."))
            continue
        ftype = spec.get("type", "object")
        out.append(
            MappingField(
                name=full,
                type=ftype,
                is_keyword=ftype == "keyword",
                is_date=ftype in {"date", "date_nanos"},
                is_text=ftype == "text",
            )
        )
    return out


def _to_int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
