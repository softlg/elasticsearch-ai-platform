import pytest

from app.services.es_gateway import DSLSecurityError, validate_dsl


def test_validate_dsl_adds_default_size():
    safe = validate_dsl({"query": {"match_all": {}}}, max_size=100)
    assert safe["size"] == 100


def test_validate_dsl_rejects_unknown_top_level_key():
    try:
        validate_dsl({"delete": {"index": "logs"}}, max_size=100)
    except DSLSecurityError as exc:
        assert "不允许的 DSL 字段" in str(exc)
    else:
        raise AssertionError("expected DSLSecurityError")


def test_validate_dsl_rejects_script_query():
    with pytest.raises(DSLSecurityError, match="禁止的查询类型"):
        validate_dsl({"query": {"script": {"script": "1 == 1"}}}, max_size=100)


def test_validate_dsl_rejects_script_nested_in_bool_list():
    with pytest.raises(DSLSecurityError, match="禁止的查询类型"):
        validate_dsl(
            {"query": {"bool": {"must": [{"script": {"source": "true"}}]}}},
            max_size=100,
        )


def test_validate_dsl_rejects_script_capable_top_level_fields():
    with pytest.raises(DSLSecurityError, match="不允许的 DSL 字段"):
        validate_dsl(
            {"query": {"match_all": {}}, "runtime_mappings": {}}, max_size=100
        )
    with pytest.raises(DSLSecurityError, match="不允许的 DSL 字段"):
        validate_dsl(
            {"query": {"match_all": {}}, "script_fields": {}}, max_size=100
        )


def test_validate_dsl_rejects_negative_paging_values():
    with pytest.raises(DSLSecurityError, match="size 不能为负数"):
        validate_dsl({"query": {"match_all": {}}, "size": -1}, max_size=100)
    with pytest.raises(DSLSecurityError, match="from 必须是非负整数"):
        validate_dsl({"query": {"match_all": {}}, "from": -1}, max_size=100)


def test_validate_dsl_rejects_scripts_in_aggregations():
    with pytest.raises(DSLSecurityError, match="禁止的查询类型"):
        validate_dsl(
            {
                "query": {"match_all": {}},
                "aggs": {"by_level": {"terms": {"script": "doc.level"}}},
            },
            max_size=100,
        )


def test_validate_dsl_rejects_oversized_aggregation_buckets():
    with pytest.raises(DSLSecurityError, match="聚合 size 超出范围"):
        validate_dsl(
            {
                "query": {"match_all": {}},
                "aggs": {"by_host": {"terms": {"field": "host", "size": 1001}}},
            },
            max_size=100,
        )
