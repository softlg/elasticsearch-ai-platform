"""LLM Provider 工厂。

支持 OpenAI 兼容的 chat/completions 通道（默认），以及部分网关（如 newapi 的
codex channel）仅支持的 /responses 通道作为后备。两条通道对外暴露同一个
`chat_completion(messages, response_format)` 接口，返回模型纯文本，下游无需感知。

配置项（来自 .env / 环境变量）：
- LLM_BASE_URL:  网关地址，例如 http://newapi.xxx/v1
- LLM_API_KEY:   API Key
- LLM_MODEL:     模型名
- LLM_USE_RESPONSES:  true 时走 /responses 通道（用于 codex channel 等不支持
                    chat/completions 的网关）；false/缺省 走标准 chat 通道。
"""
from __future__ import annotations

import json
import os
from typing import Dict, List, Optional

import requests

from app.config import settings


def _build_client():
    """构造标准 OpenAI 兼容客户端（chat 通道）。"""
    from openai import OpenAI

    kwargs = {"api_key": settings.llm_api_key, "base_url": settings.llm_base_url}
    if settings.llm_timeout:
        kwargs["timeout"] = settings.llm_timeout
        kwargs["max_retries"] = 1
    return OpenAI(**kwargs)


_client = None


def is_configured() -> bool:
    """判断 LLM 是否已配置（有 API Key）。"""
    return bool(settings.llm_api_key)


def _get_client():
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def _messages_to_input(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """把 chat messages 转成 responses 通道的 input 列表（保留 role/content）。"""
    out = []
    for m in messages:
        role = m.get("role", "user")
        # responses 接口只接受 user / assistant / system / developer 等角色
        out.append({"role": role, "content": m.get("content", "")})
    return out


def _call_responses(
    messages: List[Dict[str, str]],
    response_format: Optional[Dict] = None,
    stream: bool = False,
):
    """调用 /v1/responses 通道（codex channel 等）。

    stream=False 时返回模型完整文本（str）；
    stream=True  时返回一个增量文本的生成器（Generator[str, None, None]）。
    """
    base = settings.llm_base_url.rstrip("/")
    url = f"{base}/responses"
    payload: Dict = {
        "model": settings.llm_model,
        "input": _messages_to_input(messages),
        "stream": True,
    }
    if response_format and response_format.get("type") == "json_object":
        payload["text"] = {"format": {"type": "json_object"}}

    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    resp = requests.post(
        url,
        headers=headers,
        data=json.dumps(payload),
        timeout=settings.llm_timeout or 60,
        stream=True,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"LLM responses call failed: {resp.status_code} {resp.text[:500]}"
        )

    # 解析 SSE 流。responses 流式事件形如：
    #   data: {"type":"response.output_text.delta","delta":"..."}
    #   data: {"type":"response.completed", ...}
    #   data: [DONE]
    def _iter():
        for raw_line in resp.iter_lines(decode_unicode=False):
            if not raw_line:
                continue
            # 显式按 UTF-8 解码，避免 decode_unicode=True 在分块边界切断多字节中文
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data_str = line[len("data:"):].strip()
            if data_str == "[DONE]":
                break
            try:
                evt = json.loads(data_str)
            except Exception:
                continue
            etype = evt.get("type", "")
            if "output_text" in etype and "delta" in evt:
                yield evt["delta"]
            elif etype == "response.output_text":
                # 非 delta 的完整文本事件（兜底）
                if evt.get("text"):
                    yield evt["text"]

    if stream:
        return _iter()

    texts: List[str] = list(_iter())
    return "".join(texts).strip()


def chat_completion(
    messages: List[Dict[str, str]],
    response_format: Optional[Dict] = None,
    stream: bool = False,
):
    """统一的对话补全接口。

    stream=False 返回模型完整文本（str）；
    stream=True  返回增量文本生成器（Generator[str, None, None]）。
    """
    if not settings.llm_api_key:
        raise RuntimeError(
            "LLM 未配置：请在 .env 中设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL"
        )

    if settings.llm_use_responses:
        return _call_responses(messages, response_format, stream=stream)

    client = _get_client()
    kwargs: Dict = {"model": settings.llm_model, "messages": messages, "stream": stream}
    if response_format:
        kwargs["response_format"] = response_format
    try:
        completion = client.chat.completions.create(**kwargs)
    except Exception as e:  # noqa
        # 若网关不支持 chat 通道，给出明确提示
        msg = str(e)
        if "chat/completions endpoint not supported" in msg:
            raise RuntimeError(
                "当前网关不支持 chat/completions，请将 .env 中 LLM_USE_RESPONSES 设为 true"
            )
        raise
    if stream:
        def _iter():
            for chunk in completion:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        return _iter()
    return completion.choices[0].message.content or ""
