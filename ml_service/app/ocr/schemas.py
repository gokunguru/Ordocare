from __future__ import annotations

from pydantic import BaseModel


class OCRResponse(BaseModel):
    text: str
    engine: str
    processing_ms: int
    pages: int
