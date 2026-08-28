"""查询执行接口：自然语言 / DSL 两种方式，经安全校验后执行。"""
from __future__ import annotations

import json
from typing import Dict, List

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.schemas.models import QueryRequest, QueryResult
from app.services import index_service
from app.services.es_gateway import execute_search, DSLSecurityError
from app.services.nl_to_dsl import nl_to_dsl
from app.services.llm_provider import is_configured

router = APIRouter(prefix="/api/query", tags=["query"])


@router.post("", response_model=QueryResult)
def run_query(req: QueryRequest):
    if not req.index:
        raise HTTPException(status_code=400, detail="index 不能为空")

    dsl: Dict = {}
    explanation: str | None = None
    from_user_dsl = False

    if req.dsl:
        # 用户直接提供的 DSL
        dsl = req.dsl
        from_user_dsl = True
        explanation = "用户提供的 DSL"
    elif req.natural_language:
        if not is_configured():
            raise HTTPException(
                status_code=400,
                detail="未配置大模型 API Key，无法使用自然语言查询。请在 .env 中设置 LLM_API_KEY，或直接提供 DSL。",
            )
        try:
            mapping = index_service.get_mapping(req.index)
            fields = [{"name": f.name, "type": f.type} for f in mapping.fields]
            gen = nl_to_dsl(req.index, req.natural_language, fields, req.language)
            dsl = gen["dsl"]
            explanation = gen["explanation"]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI 生成 DSL 失败：{e}")
    else:
        raise HTTPException(status_code=400, detail="必须提供 natural_language 或 dsl 之一")

    # 注入时间范围 / 关键字 / 字段过滤
    dsl = _apply_filters(dsl, req)

    # size / from
    # 默认 50（配合前端分页加载）；上限取 settings.es_max_size（.env 的 ES_MAX_SIZE，可调）。
    # 不做任何上限的话，size 超过 ES 的 index.max_result_window（默认 10000，from+size 之和）
    # 会直接报 400，且一次拉全量会拖垮前端渲染，因此这里必须保留一个安全上限。
    effective_size = 50
    if req.size:
        effective_size = min(req.size, settings.es_max_size)
    # 始终以上游指定的 size 为准，覆盖任何 DSL 内自带的 size（避免 AI 生成的大 size 一次拉爆）
    dsl["size"] = effective_size
    if req.from_:
        dsl["from"] = req.from_

    # 默认按时间倒序：若 DSL 未指定 sort，则在日期字段上注入 desc 排序
    if not dsl.get("sort"):
        try:
            mapping = index_service.get_mapping(req.index)
            date_field = _find_date_field(mapping.fields)
            if date_field:
                dsl["sort"] = [{date_field: {"order": "desc"}}]
        except Exception:
            pass

    try:
        total, hits, took = execute_search(req.index, dsl)
    except DSLSecurityError as e:
        raise HTTPException(status_code=400, detail=f"DSL 安全校验未通过：{e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ES 查询失败：{e}")

    from_pos = req.from_ or 0
    # 本批拿满（条数达到本次请求的 size）即认为可能还有更多；避免 total 为近似值（track_total_hits）时误判已到底
    has_more = len(hits) >= effective_size

    return QueryResult(
        index=req.index,
        total=total,
        executed_dsl=dsl,
        dsl_explanation=explanation,
        hits=hits,
        took_ms=took,
        from_user_dsl=from_user_dsl,
        from_=from_pos,
        size=effective_size,
        has_more=has_more,
    )


def _apply_filters(dsl: Dict, req: QueryRequest) -> Dict:
    """将时间范围、关键字、字段过滤合并进 query（bool 组合）。"""
    must: List[Dict] = []
    filter_clauses: List[Dict] = []

    # 关键字
    if req.keyword:
        if req.keyword_exact:
            # 精确搜索：短语整体匹配（词序一致）
            must.append({"match_phrase": {"query": req.keyword}})
        else:
            # 显式指定 fields=["*"]：让 ES 在查询时解析到所有 text 与 keyword
            # 子字段（包括 *.keyword），避免索引字段多为 keyword 类型时检索不到。
            must.append(
                {
                    "multi_match": {
                        "query": req.keyword,
                        "fields": ["*"],
                        "lenient": True,
                    }
                }
            )

    # 字段过滤
    for f in req.filters:
        if f.op == "term":
            filter_clauses.append({"term": {f.field: f.value}})
        elif f.op == "range":
            filter_clauses.append({"range": {f.field: json.loads(f.value)}})
        else:  # match
            must.append({"match": {f.field: f.value}})

    # 时间范围（注入到 query，作用于任意 date 字段）
    if req.time_range and (req.time_range.from_ or req.time_range.to):
        mapping = index_service.get_mapping(req.index)
        date_field = _find_date_field(mapping.fields)
        if date_field:
            rng: Dict = {}
            if req.time_range.from_:
                rng["gte"] = req.time_range.from_
            if req.time_range.to:
                rng["lte"] = req.time_range.to
            filter_clauses.append({"range": {date_field: rng}})

    if not (must or filter_clauses):
        return dsl

    existing = dsl.get("query", {})
    bool_q: Dict = existing.get("bool", {}) if isinstance(existing, dict) else {}
    new_must = list(bool_q.get("must", [])) + must
    new_filter = list(bool_q.get("filter", [])) + filter_clauses
    dsl["query"] = {"bool": {**bool_q, "must": new_must, "filter": new_filter}}
    return dsl


# 常见时间字段名（按优先级）。当 mapping 未显式标记 date 类型时，
# 退而使用这些常见名称，保证时间范围过滤在大多数日志索引上生效。
_COMMON_DATE_FIELDS = ("@timestamp", "timestamp", "time", "@time", "event_time", "log_time", "date")


def _find_date_field(fields) -> str | None:
    # 优先：mapping 中标记为 date 的字段
    for f in fields:
        if f.is_date:
            return f.name
    # 兜底：按常见时间字段名匹配（不区分大小写）
    names_lower = {f.name.lower(): f.name for f in fields}
    for cand in _COMMON_DATE_FIELDS:
        if cand.lower() in names_lower:
            return names_lower[cand.lower()]
    return None
