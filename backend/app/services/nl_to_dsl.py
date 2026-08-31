"""自然语言 → ES DSL 服务。

将索引 mapping 作为上下文注入 Prompt，约束模型仅输出合法 DSL JSON，并附带解释。
"""
from __future__ import annotations

import json
from typing import Dict, List, Optional

from app.services.llm_provider import chat_completion
from app.services.es_gateway import DSLSecurityError

_PROMPT_ZH = """你是一个 Elasticsearch 专家。请根据用户的中文自然语言需求，生成 ONLY 一个合法的 Elasticsearch 查询 DSL（JSON）。

# 目标索引：{index}
# 索引字段与类型（name: type）：
{fields}

# 用户需求：
{nl}

# 要求：
1. 仅输出一个 JSON 对象，包含 query / sort / size / aggs 等只读字段，不要包含任何写操作。
2. 如果用户提到时间范围，请使用 range 查询作用在日期字段上（根据上面字段类型推断）。
3. 如果用户提到关键字，使用 match 或 multi_match 全文检索。
4. 如果用户提到某个字段精确值，使用 term 查询（keyword 类型）。
5. size 不要超过 200。
6. 不要输出任何解释文字、不要使用 markdown 代码块，直接输出 JSON。

# 输出格式（严格 JSON）：
{{"query": {{...}}, "sort": [{{...}}], "size": 100}}"""

_PROMPT_EN = """You are an Elasticsearch expert. Convert the user's English request into ONLY a valid Elasticsearch query DSL (JSON).

# Target index: {index}
# Index fields and types (name: type):
{fields}

# User request:
{nl}

# Requirements:
1. Output only a single JSON object with read-only fields (query/sort/size/aggs). No write operations.
2. If a time range is mentioned, use a range query on a date field (infer from field types above).
3. If keywords are mentioned, use match or multi_match for full-text search.
4. If an exact field value is mentioned, use term query (keyword type).
5. size must not exceed 200.
6. Do NOT output any explanation or markdown code fences, just the JSON.

# Output (strict JSON):
{{"query": {{...}}, "sort": [{{...}}], "size": 100}}"""


def _build_fields_text(fields: List[Dict[str, str]]) -> str:
    if not fields:
        return "(无字段信息，请基于常见日志字段合理推断)"
    return "\n".join(f"- {f['name']}: {f['type']}" for f in fields)


def _extract_json(text: str) -> Dict:
    text = text.strip()
    # 去掉可能的 ```json ... ``` 包裹
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("模型未返回有效 JSON")
    json_str = text[start : end + 1]
    return json.loads(json_str)


def _unwrap_nl(nl: str) -> str:
    """如果用户传入的 natural_language 本身是一个 JSON（例如直接粘贴了完整请求体），
    自动提取其中的 natural_language 字段，避免把整段 JSON 当作检索文本。"""
    s = nl.strip()
    if not (s.startswith("{") and s.endswith("}")):
        return nl
    try:
        obj = json.loads(s)
    except Exception:
        return nl
    if isinstance(obj, dict) and isinstance(obj.get("natural_language"), str):
        return obj["natural_language"]
    return nl


def nl_to_dsl(
    index: str,
    nl: str,
    fields: List[Dict[str, str]],
    language: str = "zh",
) -> Dict[str, str]:
    """返回 {dsl: dict, explanation: str}。explanation 由第二次调用生成（轻量）。"""
    nl = _unwrap_nl(nl)
    prompt_tmpl = _PROMPT_ZH if language != "en" else _PROMPT_EN
    prompt = prompt_tmpl.format(
        index=index, fields=_build_fields_text(fields), nl=nl
    )
    messages = [
        {"role": "system", "content": "You are a precise Elasticsearch DSL generator."},
        {"role": "user", "content": prompt},
    ]
    raw = chat_completion(messages)
    dsl = _extract_json(raw)
    return {"dsl": dsl, "explanation": _short_explain(nl, language)}


def _short_explain(nl: str, language: str) -> str:
    if language == "en":
        return f"Generated based on: \"{nl}\""
    return f"根据需求「{nl}」生成的查询。"
