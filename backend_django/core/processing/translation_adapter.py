from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


class TranslationAdapterError(RuntimeError):
    pass


@dataclass(frozen=True)
class AdapterTranslationResponse:
    translated_text: str
    provider: str
    src_lang: str
    tgt_lang: str


class TranslationAdapter:
    """
    Adapter technique: appelle le microservice ML (FastAPI).
    Ne dépend pas de Django (pas de settings import ici).
    """

    def __init__(self, *, base_url: str, api_key: str = "", timeout_s: int = 120):
        if not base_url:
            raise TranslationAdapterError("base_url is required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_s = timeout_s

    def translate(self, *, text: str, src_lang: str, tgt_lang: str) -> AdapterTranslationResponse:
        url = f"{self.base_url}/translation/translate"
        payload = {"text": text, "src_lang": src_lang, "tgt_lang": tgt_lang}
        headers = {}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key

        try:
            r = requests.post(url, json=payload, headers=headers, timeout=self.timeout_s)
        except requests.RequestException as e:
            raise TranslationAdapterError(f"Translation service unreachable: {e}") from e

        if r.status_code >= 400:
            raise TranslationAdapterError(f"Translation service error: HTTP {r.status_code} - {r.text}")

        data: Dict[str, Any] = r.json()
        return AdapterTranslationResponse(
            translated_text=data.get("translated_text", ""),
            provider=data.get("provider", "unknown"),
            src_lang=data.get("src_lang", src_lang),
            tgt_lang=data.get("tgt_lang", tgt_lang),
        )
