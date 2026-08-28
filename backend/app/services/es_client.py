"""ES 客户端单例：复用连接池，支持账号/证书配置。"""
from __future__ import annotations

from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan

from app.config import settings


_client: Elasticsearch | None = None


def get_es_client() -> Elasticsearch:
    global _client
    if _client is not None:
        return _client

    import urllib.parse

    def _with_port(url: str) -> str:
        p = urllib.parse.urlparse(url)
        if not p.scheme or not p.hostname:
            raise ValueError(f"Invalid ES host: {url}")
        if not p.port:
            scheme = p.scheme
            netloc = p.hostname + ":9200"
            return f"{scheme}://{netloc}{p.path}"
        return url

    hosts = [_with_port(h) for h in settings.es_host_list]
    kwargs: dict = {
        "hosts": hosts,
        "request_timeout": settings.es_request_timeout,
    }

    if settings.es_username:
        kwargs["basic_auth"] = (settings.es_username, settings.es_password)

    if settings.es_use_ssl:
        kwargs["verify_certs"] = settings.es_verify_certs
        kwargs["ssl_show_warn"] = False

    _client = Elasticsearch(**kwargs)
    return _client


def reset_client() -> None:
    """配置变更后重建连接（开发/测试用）。"""
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    _client = None
