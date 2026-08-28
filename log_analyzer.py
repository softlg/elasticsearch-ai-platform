"""基于查询结果的日志 AI 分析：问题归纳、根因、解决建议。"""
from __future__ import annotations

import json
from typing import Dict, List

from app.services.llm_provider import chat_completion

# 发送给模型的日志样本字符预算（留出 prompt/分析的剩余空间，远小于模型 10MB 上限）
_MAX_LOGS_CHARS = 600_000
_MAX_ONE_LOG_CHARS = 40_000
_MAX_PREV_CHARS = 60_000


def _truncate_logs(hits: List[Dict], max_chars: int = _MAX_LOGS_CHARS) -> List[Dict]:
    """按总字符预算截断日志样本，单条过长也截断，避免超出模型输入上限。"""
    out: List[Dict] = []
    total = 0
    for h in hits:
        s = json.dumps(h, ensure_ascii=False, default=str)
        if len(s) > _MAX_ONE_LOG_CHARS:
            s = s[:_MAX_ONE_LOG_CHARS] + "...(truncated)"
            h = {"_truncated_log": s}
        if total + len(s) > max_chars:
            break
        out.append(h)
        total += len(s)
    return out

_PROMPT_ZH = """你是一位资深的运维/日志分析专家。下面是来自 Elasticsearch 索引「{index}」的日志样本（JSON 数组，最多 {n} 条）。

{logs}

请完成以下分析，并以严格的 JSON 输出（不要 markdown 代码块）：
{{
  "summary": "用 1-3 句话概括日志中反映的核心问题",
  "root_cause": "分析可能的根因",
  "suggestions": ["建议1", "建议2", "建议3"],
  "severity": "low | medium | high"
}}
{focus_note}

只输出 JSON。"""

_PROMPT_EN = """You are a senior SRE/log analysis expert. Below are log samples (JSON array, up to {n} records) from Elasticsearch index "{index}".

{logs}

Analyze and output STRICT JSON only (no markdown code fences):
{{
  "summary": "Summarize the core issue in 1-3 sentences",
  "root_cause": "Analyze the likely root cause",
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "severity": "low | medium | high"
}}
{focus_note}

Output JSON only."""


def build_messages(
    index: str,
    hits: List[Dict],
    language: str = "zh",
    focus: str | None = None,
) -> List[Dict[str, str]]:
    tmpl = _PROMPT_ZH if language != "en" else _PROMPT_EN
    focus_note = ""
    if focus:
        focus_note = ("\n用户特别关注：" + focus) if language != "en" else (
            "\nUser focus: " + focus
        )
    logs_sample = _truncate_logs(hits)
    logs = json.dumps(logs_sample, ensure_ascii=False, default=str)
    prompt = tmpl.format(index=index, n=len(logs_sample), logs=logs, focus_note=focus_note)
    return [
        {"role": "system", "content": "You output strict JSON only."},
        {"role": "user", "content": prompt},
    ]


def extract_json(text: str):
    """从模型输出中稳健提取 JSON 对象（兼容 ```json 代码块包裹）。"""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[:-3]
        t = t.strip()
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        t = t[start : end + 1]
    return t


def analyze_logs(
    index: str,
    hits: List[Dict],
    language: str = "zh",
    focus: str | None = None,
) -> Dict:
    messages = build_messages(index, hits, language, focus)
    raw = chat_completion(messages, response_format={"type": "json_object"})

    try:
        data = json.loads(extract_json(raw))
    except Exception:
        data = {"summary": raw, "root_cause": "", "suggestions": [], "severity": None}
    data["raw"] = raw
    return data


_FOLLOWUP_ZH = """你是一位资深的运维/日志分析专家，正在和用户就一次日志排查进行持续对话。

下面是本次分析所依据的 Elasticsearch 索引「{index}」的日志样本（JSON 数组）：
{logs}

之前对这批日志的 AI 分析结果（JSON）如下：
{prev}

请结合上述日志与已给出的分析，针对用户的追问用简体中文清晰、具体作答。如果问题需要更多日志细节而样本中没有，请明确说明。不要输出 markdown 代码块。"""

_FOLLOWUP_EN = """You are a senior SRE/log analysis expert continuing a conversation about a log investigation.

Below are the log samples (JSON array) from Elasticsearch index "{index}" this analysis is based on:
{logs}

The previous AI analysis result (JSON) for these logs was:
{prev}

Based on the logs and the analysis above, answer the user's follow-up question clearly and specifically in English. If the question needs log details not present in the sample, say so explicitly. Do not output markdown code fences."""


def build_followup_messages(
    index: str,
    hits: List[Dict],
    question: str,
    prev_analysis: str | None = None,
    language: str = "zh",
) -> List[Dict[str, str]]:
    tmpl = _FOLLOWUP_ZH if language != "en" else _FOLLOWUP_EN
    logs_sample = _truncate_logs(hits)
    logs = json.dumps(logs_sample, ensure_ascii=False, default=str)
    prev = prev_analysis or ("（无）" if language != "en" else "(none)")
    if len(prev) > _MAX_PREV_CHARS:
        prev = prev[:_MAX_PREV_CHARS] + "...(truncated)"
    prompt = tmpl.format(index=index, logs=logs, prev=prev)
    return [
        {"role": "system", "content": "You are a helpful log analysis assistant."},
        {"role": "user", "content": prompt},
        {"role": "user", "content": question},
    ]
