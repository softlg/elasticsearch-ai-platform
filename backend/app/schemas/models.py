"""请求/响应 Pydantic 模型。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------- 索引 / Mapping ----------------
class IndexInfo(BaseModel):
    name: str
    health: Optional[str] = None
    docs_count: Optional[int] = None
    store_size: Optional[str] = None


class MappingField(BaseModel):
    name: str
    type: str
    # 是否为日期/关键字等重要类型，便于前端展示
    is_keyword: bool = False
    is_date: bool = False
    is_text: bool = False


class IndexMapping(BaseModel):
    index: str
    fields: List[MappingField] = []


# ---------------- 查询 ----------------
class TimeRange(BaseModel):
    # ISO8601 或 ES 接受的日期字符串；为空表示不限
    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None

    model_config = {"populate_by_name": True}


class FilterCondition(BaseModel):
    # 字段过滤：field 匹配 value（keyword 精确 / text 分词）
    field: str
    value: str
    # match / term / range
    op: str = "match"


class QueryRequest(BaseModel):
    index: str
    # 自然语言描述（与 dsl 二选一，优先 dsl）
    natural_language: Optional[str] = None
    dsl: Optional[Dict[str, Any]] = None
    # 界面语言：zh / en
    language: str = "zh"
    time_range: Optional[TimeRange] = None
    # 关键字（全文检索）
    keyword: Optional[str] = None
    # 关键字是否精确匹配（True=短语精确 match_phrase，False=默认全文 multi_match）
    keyword_exact: bool = False
    # 附加字段过滤
    filters: List[FilterCondition] = []
    size: int = 50
    from_: int = Field(default=0, alias="from")

    model_config = {"populate_by_name": True}


class QueryResult(BaseModel):
    index: str
    total: int
    # 生成的 DSL（经过安全校验后的最终 DSL）
    executed_dsl: Dict[str, Any]
    # AI 对 DSL 的解释
    dsl_explanation: Optional[str] = None
    hits: List[Dict[str, Any]] = []
    took_ms: int = 0
    # DSL 是否来自用户原始输入（true=用户直接提供，false=AI 生成）
    from_user_dsl: bool = False
    # 分页信息：本次起始位置与本批大小
    from_: int = Field(default=0, alias="from")
    size: int = 50
    # 是否还有更多数据（前端据此决定是否展示"加载更多"）
    has_more: bool = False

    model_config = {"populate_by_name": True}


# ---------------- AI 分析 ----------------
class AnalysisRequest(BaseModel):
    index: str
    # 前端传入的查询结果（精简后的 hits）
    hits: List[Dict[str, Any]] = []
    # 用户可选的关注点
    focus: Optional[str] = None
    language: str = "zh"


class AnalysisResult(BaseModel):
    summary: str = ""                 # 问题归纳
    root_cause: str = ""              # 根因分析
    suggestions: List[str] = []       # 解决建议
    severity: Optional[str] = None    # low/medium/high
    raw: Optional[str] = None         # 模型原始输出（便于排错）


# ---------------- 通用 ----------------
class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
