"""应用配置：通过 .env / 环境变量加载 ES 与 LLM 配置。"""
from __future__ import annotations

from functools import lru_cache
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ----- Elasticsearch -----
    es_hosts: str = "http://localhost:9200"
    es_username: str = ""
    es_password: str = ""
    es_use_ssl: bool = False
    es_verify_certs: bool = False
    es_request_timeout: int = 30
    es_max_size: int = 1000

    # ----- LLM (OpenAI 兼容) -----
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_timeout: int = 60
    llm_temperature: float = 0.2
    llm_use_responses: bool = False

    # ----- Server -----
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "*"

    @property
    def es_host_list(self) -> List[str]:
        return [h.strip() for h in self.es_hosts.split(",") if h.strip()]

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
