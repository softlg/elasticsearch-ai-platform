"""FastAPI 入口：挂载路由、CORS、生命周期。"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import indices, query, analysis

app = FastAPI(title="Elasticsearch AI 查询平台", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(indices.router)
app.include_router(query.router)
app.include_router(analysis.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_configured": bool(settings.llm_api_key)}
