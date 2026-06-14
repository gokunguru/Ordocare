from __future__ import annotations

import re
import threading
import unicodedata
from typing import Any

import torch
from .model_loader import get_nllb_bundle

# NLLB language codes follow pattern: xxx_Yyyy (e.g., fra_Latn, arb_Arab)
_LANG_CODE_RE = re.compile(r"^[a-z]{3}_[A-Z][a-z]{3}$")

MAX_INPUT_LENGTH = 5000
_tokenizer_lock = threading.Lock()

def _sanitize_text(text: str) -> str:
    """Nettoie le texte : normalisation Unicode et suppression des caractères de contrôle."""
    # Normalisation NFKC (combinaisons de caractères etc)
    text = unicodedata.normalize("NFKC", text)
    # Suppression des caractères de contrôle (sauf saut de ligne et tab)
    return "".join(ch for ch in text if unicodedata.category(ch)[0] != "C" or ch in "\n\t")


class TranslationError(RuntimeError):
    pass


def _validate_lang_code(code: str) -> None:
    """Validate that a language code matches the NLLB format."""
    if not code or not _LANG_CODE_RE.match(code):
        raise TranslationError(f"Format de code langue invalide : {code}")


def _lang_to_token_id(tokenizer: Any, lang_code: str) -> int:
    """
    NLLB language codes are special tokens (e.g., 'eng_Latn').
    Some tokenizer versions don't expose lang_code_to_id, so we rely on convert_tokens_to_ids.
    """
    token_id = tokenizer.convert_tokens_to_ids(lang_code)

    # convert_tokens_to_ids can return unk_token_id if missing
    unk_id = getattr(tokenizer, "unk_token_id", None)
    if token_id is None or token_id < 0 or (unk_id is not None and token_id == unk_id):
        raise TranslationError(f"Unsupported language code: {lang_code}")

    return token_id


def translate_text(*, text: str, src_lang: str, tgt_lang: str, max_new_tokens: int = 256) -> str:
    if not text or not text.strip():
        raise TranslationError("text is required")

    if not src_lang or not tgt_lang:
        raise TranslationError("src_lang and tgt_lang are required")

    _validate_lang_code(src_lang)
    _validate_lang_code(tgt_lang)

    if len(text) > MAX_INPUT_LENGTH:
        raise TranslationError(f"Texte trop long (max {MAX_INPUT_LENGTH} caractères)")

    if src_lang == tgt_lang:
        return text

    # Phase 3 : Sanitisation Unicode
    text = _sanitize_text(text)

    tokenizer, model, device, _model_name = get_nllb_bundle()

    # Phase 3 : Thread-Safe Access (Lock)
    with _tokenizer_lock:
        # Validate language codes + compute ids
        _lang_to_token_id(tokenizer, src_lang)
        forced_bos_token_id = _lang_to_token_id(tokenizer, tgt_lang)

        # Set source language (common for NLLB)
        if hasattr(tokenizer, "src_lang"):
            tokenizer.src_lang = src_lang
        else:
            # Should not happen for NLLB, but keep a clear error
            raise TranslationError("Tokenizer does not support setting src_lang")

        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            generated = model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                max_new_tokens=max_new_tokens,
                num_beams=4,
            )

        out = tokenizer.batch_decode(generated, skip_special_tokens=True)
    return (out[0] if out else "").strip()