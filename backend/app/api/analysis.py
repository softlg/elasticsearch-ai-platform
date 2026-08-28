"""AI 日志分析接口。"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.models import AnalysisRequest
from app.services.log_analyzer import (
    analyze_logs,
    build_messages,
    build_followup_messages,
    extract_json,
)
from app.services.llm_provider import chat_completion, is_configured

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("", response_model=dict)
def analyze(req: AnalysisRequest):
    if not is_configured():
        raise HTTPException(
            status_code=400,
            detail="未配置大模型 API Key，无法进行 AI 分析。请在 .env 中设置 LLM_API_KEY。",
        )
    if not req.hits:
        raise HTTPException(status_code=400, detail="没有可分析的日志数据")

    try:
        result = analyze_logs(req.index, req.hits, req.language, req.focus)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 分析失败：{e}")

    return result


@router.post("/stream")
def analyze_stream(req: AnalysisRequest):
    if not is_configured():
        raise HTTPException(status_code=400, detail="未配置大模型 API Key。")
    if not req.hits:
        raise HTTPException(status_code=400, detail="没有可分析的日志数据")

    messages = build_messages(req.index, req.hits, req.language, req.focus)
    rf = {"type": "json_object"}

    def gen():
        try:
            acc: list[str] = []
            for delta in chat_completion(messages, response_format=rf, stream=True):
                acc.append(delta)
                yield f"data: {json.dumps({'text': delta}, ensure_ascii=False)}\n\n"
            # 收尾：把完整文本解析为结构化结果一并回传
            raw = "".join(acc).strip()
            try:
                data = json.loads(extract_json(raw))
            except Exception:
                data = {"summary": raw, "root_cause": "", "suggestions": [], "severity": None}
            data["raw"] = raw
            yield f"data: {json.dumps({'done': True, 'result': data}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class FollowupRequest(AnalysisRequest):
    question: str
    prev_analysis: str | None = None


@router.post("/followup")
def analyze_followup(req: FollowupRequest):
    """基于已有分析结果，对日志进行持续追问（流式返回纯文本）。"""
    if not is_configured():
        raise HTTPException(status_code=400, detail="未配置大模型 API Key。")
    if not req.hits:
        raise HTTPException(status_code=400, detail="没有可分析的日志数据")
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="追问内容不能为空")

    messages = build_followup_messages(
        req.index, req.hits, req.question, req.prev_analysis, req.language
    )

    def gen():
        try:
            for delta in chat_completion(messages, stream=True):
                yield f"data: {json.dumps({'text': delta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
