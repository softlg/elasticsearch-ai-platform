"""标准 MCP Server：把 Elasticsearch 日志能力提供给其它 Agent。

默认使用 stdio 传输，适合由本地 Agent 启动：

    python -m app.mcp_server

远程部署可切换为 Streamable HTTP：

    MCP_TRANSPORT=streamable-http python -m app.mcp_server

MCP 层直接复用现有服务和 DSL 安全校验，不绕过 REST API 的安全边界。
"""
from __future__ import annotations

import argparse
import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from app.api.query import run_query
from app.schemas.models import QueryRequest
from app.services import index_service
from app.services.log_analyzer import analyze_logs, build_followup_messages
from app.services.llm_provider import chat_completion, is_configured


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


mcp = FastMCP(
    "elasticsearch-ai-platform",
    host=os.getenv("MCP_HOST", "127.0.0.1"),
    port=_env_int("MCP_PORT", 9000),
)


@mcp.tool()
def list_es_indices() -> list[dict[str, Any]]:
    """获取当前 Elasticsearch 集群中的索引列表。"""
    return [item.model_dump() for item in index_service.list_indices()]


@mcp.tool()
def get_index_mapping(index: str) -> dict[str, Any]:
    """获取指定索引的字段 mapping。"""
    if not index or not index.strip():
        raise ValueError("index 不能为空")
    return index_service.get_mapping(index.strip()).model_dump()


@mcp.tool()
def search_logs(
    index: str,
    natural_language: str | None = None,
    dsl: dict[str, Any] | None = None,
    size: int = 100,
    from_offset: int = 0,
    language: str = "zh",
) -> dict[str, Any]:
    """查询 Elasticsearch 日志，默认返回 100 条。

    natural_language 与 dsl 至少提供一个。DSL 会经过现有安全校验，禁止写操作、
    脚本和危险聚合；size 最大受 ES_MAX_SIZE 配置限制。
    """
    if not natural_language and not dsl:
        raise ValueError("natural_language 和 dsl 至少提供一个")
    if size < 0 or size > 1000:
        raise ValueError("size 必须在 0 到 1000 之间")
    if from_offset < 0:
        raise ValueError("from_offset 不能为负数")

    request = QueryRequest(
        index=index,
        natural_language=natural_language,
        dsl=dsl,
        size=size,
        from_=from_offset,
        language=language,
    )
    try:
        result = run_query(request)
    except Exception as exc:
        # 将 FastAPI/ES 异常转换为 MCP 可读的工具错误。
        detail = getattr(exc, "detail", None) or str(exc)
        raise RuntimeError(detail) from exc
    return result.model_dump(by_alias=True)


@mcp.tool()
def analyze_log_samples(
    index: str,
    hits: list[dict[str, Any]],
    focus: str | None = None,
    language: str = "zh",
) -> dict[str, Any]:
    """使用已配置的大模型分析日志样本，返回问题、根因、建议和严重程度。"""
    if not hits:
        raise ValueError("hits 不能为空")
    if not is_configured():
        raise RuntimeError("未配置 LLM_API_KEY")
    return analyze_logs(index, hits, language, focus)


@mcp.tool()
def ask_about_log_samples(
    index: str,
    hits: list[dict[str, Any]],
    question: str,
    previous_analysis: str | None = None,
    language: str = "zh",
) -> dict[str, str]:
    """基于日志样本和已有分析，回答 Agent 的后续问题。"""
    if not hits:
        raise ValueError("hits 不能为空")
    if not question or not question.strip():
        raise ValueError("question 不能为空")
    if not is_configured():
        raise RuntimeError("未配置 LLM_API_KEY")
    messages = build_followup_messages(
        index, hits, question.strip(), previous_analysis, language
    )
    return {"answer": chat_completion(messages)}


@mcp.resource("es://usage")
def usage_guide() -> str:
    """返回 MCP 工具使用说明。"""
    return (
        "elasticsearch-ai-platform MCP 服务：\n"
        "- search_logs 默认 size=100，最大受 ES_MAX_SIZE 限制\n"
        "- 仅允许只读 Elasticsearch 查询\n"
        "- 禁止 script、runtime_mappings、script_fields 和危险聚合\n"
        "- 远程部署必须启用 HTTPS、鉴权和限流"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Elasticsearch AI Platform MCP Server")
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default=os.getenv("MCP_TRANSPORT", "stdio"),
        help="MCP 传输方式，默认 stdio",
    )
    args = parser.parse_args()
    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()

