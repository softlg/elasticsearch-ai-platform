import pytest

from app.mcp_server import (
    ask_about_log_samples,
    mcp,
    search_logs,
)


def test_mcp_registers_expected_tools_and_resource():
    assert set(mcp._tool_manager._tools) == {
        "list_es_indices",
        "get_index_mapping",
        "search_logs",
        "analyze_log_samples",
        "ask_about_log_samples",
    }
    assert "es://usage" in mcp._resource_manager._resources


def test_mcp_search_validates_input_before_touching_es():
    with pytest.raises(ValueError, match="至少提供一个"):
        search_logs(index="logs")
    with pytest.raises(ValueError, match="size 必须"):
        search_logs(index="logs", dsl={"query": {"match_all": {}}}, size=1001)
    with pytest.raises(ValueError, match="不能为负数"):
        search_logs(index="logs", dsl={"query": {"match_all": {}}}, from_offset=-1)


def test_mcp_followup_validates_input_before_touching_llm():
    with pytest.raises(ValueError, match="hits 不能为空"):
        ask_about_log_samples(index="logs", hits=[], question="分析一下")
    with pytest.raises(ValueError, match="question 不能为空"):
        ask_about_log_samples(index="logs", hits=[{"message": "x"}], question=" ")

