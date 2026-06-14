"""
Chargement thread-safe du modèle TrOCR.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

from app.utils import get_device

logger = logging.getLogger("ml_service")

DEFAULT_MODEL_NAME = "dj0w/trocr-french-handwriting-v5"

_processor: Optional[TrOCRProcessor] = None
_model: Optional[VisionEncoderDecoderModel] = None
_trocr_lock = threading.Lock()


def load_trocr(model_name: str = DEFAULT_MODEL_NAME) -> tuple[TrOCRProcessor, VisionEncoderDecoderModel]:
    """Charge le modèle TrOCR de manière thread-safe (double-checked locking)."""
    global _processor, _model

    if _processor is not None and _model is not None:
        return _processor, _model

    with _trocr_lock:
        if _processor is not None and _model is not None:
            return _processor, _model

        device = get_device()
        logger.info("Chargement du modèle TrOCR '%s' sur device=%s", model_name, device)
        _processor = TrOCRProcessor.from_pretrained(model_name)
        _model = VisionEncoderDecoderModel.from_pretrained(model_name)
        _model.to(device)
        _model.eval()

    return _processor, _model
