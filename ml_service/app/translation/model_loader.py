from __future__ import annotations

import os
import threading

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from app.utils import get_device

_nllb_lock = threading.Lock()
_nllb_cache: tuple | None = None


def get_nllb_bundle():
    """
    Charge tokenizer + model une seule fois (thread-safe).
    """
    global _nllb_cache

    if _nllb_cache is not None:
        return _nllb_cache

    with _nllb_lock:
        # Double-check après acquisition du lock
        if _nllb_cache is not None:
            return _nllb_cache

        model_name = os.getenv("NLLB_MODEL_NAME", "facebook/nllb-200-distilled-600M")
        device = get_device()

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        model.to(device)
        model.eval()

        _nllb_cache = (tokenizer, model, device, model_name)

    return _nllb_cache
