from app.main import health


def test_health_response():
    result = health()
    assert result["status"] == "ok"
    assert "llm_configured" in result
