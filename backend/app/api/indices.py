"""索引与 mapping 探测接口。"""
from __future__ import annotations

from fastapi import APIRouter

from app.services.index_service import list_indices, get_mapping

router = APIRouter(prefix="/api/indices", tags=["indices"])


@router.get("")
def get_indices():
    return {"indices": list_indices()}


@router.get("/{index}/mapping")
def get_index_mapping(index: str):
    return get_mapping(index)
