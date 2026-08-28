from app.services.es_gateway import DSLSecurityError, validate_dsl


def test_validate_dsl_adds_default_size():
    safe = validate_dsl({"query": {"match_all": {}}}, max_size=100)
    assert safe["size"] == 50


def test_validate_dsl_rejects_unknown_top_level_key():
    try:
        validate_dsl({"delete": {"index": "logs"}}, max_size=100)
    except DSLSecurityError as exc:
        assert "不允许的 DSL 字段" in str(exc)
    else:
        raise AssertionError("expected DSLSecurityError")


def test_validate_dsl_rejects_script_query():
    try:
        validate_dsl({"query": {"script": {"script": "1 == 1"}}}, max_size=100)
    except DSLSecurityError as exc:
        assert "禁止的查询类型" in str(exc)
    else:
        raise AssertionError("expected DSLSecurityError")
