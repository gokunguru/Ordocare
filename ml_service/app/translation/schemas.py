from __future__ import annotations

from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    src_lang: str = Field(..., pattern=r"^[a-z]{3}_[A-Z][a-z]{3}$")  # ex: fra_Latn
    tgt_lang: str = Field(..., pattern=r"^[a-z]{3}_[A-Z][a-z]{3}$")  # ex: eng_Latn
    max_new_tokens: int = Field(256, ge=1, le=1024)


class TranslateResponse(BaseModel):
    translated_text: str
    provider: str
    src_lang: str
    tgt_lang: str