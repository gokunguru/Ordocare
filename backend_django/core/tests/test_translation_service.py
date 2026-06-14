from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from django.conf import settings

from core.processing.translation_adapter import TranslationAdapterError
from core.services.translation.translation_service import (
    TranslateTextResult,
    TranslationServiceError,
    translate_text,
)

# ----------------------------
# Validation errors
# ----------------------------


def test_translate_text_requires_text():
    with pytest.raises(TranslationServiceError):
        translate_text(text="", src_lang="fra_Latn", tgt_lang="eng_Latn")


def test_translate_text_requires_languages():
    with pytest.raises(TranslationServiceError):
        translate_text(text="Bonjour", src_lang="", tgt_lang="eng_Latn")


# ----------------------------
# No-op when src == tgt
# ----------------------------


def test_translate_text_same_language_returns_noop(settings):
    settings.TRANSLATION_SERVICE_URL = "http://fake"
    settings.ML_API_KEY = "test"

    result = translate_text(
        text="Bonjour",
        src_lang="fra_Latn",
        tgt_lang="fra_Latn",
    )

    assert isinstance(result, TranslateTextResult)
    assert result.translated_text == "Bonjour"
    assert result.provider == "none"


# ----------------------------
# Missing configuration
# ----------------------------


def test_translate_text_requires_base_url(settings):
    settings.TRANSLATION_SERVICE_URL = ""

    with pytest.raises(TranslationServiceError):
        translate_text(
            text="Bonjour",
            src_lang="fra_Latn",
            tgt_lang="eng_Latn",
        )


# ----------------------------
# Success case with mocked adapter
# ----------------------------


def test_translate_text_success(settings):
    settings.TRANSLATION_SERVICE_URL = "http://fake"
    settings.ML_API_KEY = "test"

    mock_adapter = MagicMock()
    mock_adapter.translate.return_value = SimpleNamespace(
        translated_text="Hello",
        provider="mock",
        src_lang="fra_Latn",
        tgt_lang="eng_Latn",
    )

    result = translate_text(
        text="Bonjour",
        src_lang="fra_Latn",
        tgt_lang="eng_Latn",
        adapter=mock_adapter,
    )

    assert result.translated_text == "Hello"
    assert result.provider == "mock"


# ----------------------------
# Adapter failure handling
# ----------------------------


def test_translate_text_adapter_error(settings):
    settings.TRANSLATION_SERVICE_URL = "http://fake"
    settings.ML_API_KEY = "test"

    mock_adapter = MagicMock()
    mock_adapter.translate.side_effect = TranslationAdapterError("ML failed")

    with pytest.raises(TranslationServiceError):
        translate_text(
            text="Bonjour",
            src_lang="fra_Latn",
            tgt_lang="eng_Latn",
            adapter=mock_adapter,
        )
