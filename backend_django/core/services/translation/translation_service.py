from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.conf import settings

from core.processing.translation_adapter import (
    TranslationAdapter,
    TranslationAdapterError,
)


class TranslationServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class TranslateTextResult:
    translated_text: str
    provider: str
    src_lang: str
    tgt_lang: str


def translate_text(
    *,
    text: str,
    src_lang: str,
    tgt_lang: str,
    adapter: Optional[TranslationAdapter] = None,
) -> TranslateTextResult:
    """
    Service métier: valide, applique no-op, délègue l'appel technique à processing/ml.
    """
    if not text or not text.strip():
        raise TranslationServiceError("text is required")

    if not src_lang or not tgt_lang:
        raise TranslationServiceError("src_lang and tgt_lang are required")

    if src_lang == tgt_lang:
        return TranslateTextResult(
            translated_text=text,
            provider="none",
            src_lang=src_lang,
            tgt_lang=tgt_lang,
        )

    base_url = getattr(settings, "TRANSLATION_SERVICE_URL", "").strip()
    if not base_url:
        raise TranslationServiceError("TRANSLATION_SERVICE_URL is not configured")

    api_key = getattr(settings, "ML_API_KEY", "")
    adapter = adapter or TranslationAdapter(base_url=base_url, api_key=api_key)

    try:
        resp = adapter.translate(text=text, src_lang=src_lang, tgt_lang=tgt_lang)
    except TranslationAdapterError as e:
        raise TranslationServiceError(str(e)) from e

    return TranslateTextResult(
        translated_text=resp.translated_text,
        provider=resp.provider,
        src_lang=resp.src_lang,
        tgt_lang=resp.tgt_lang,
    )
