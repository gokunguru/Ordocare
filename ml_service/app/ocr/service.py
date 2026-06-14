"""
Service OCR manuscrit — Logique métier

Conversion fichier → images → texte via TrOCR.
"""

from __future__ import annotations

import os
import re
from io import BytesIO
import threading
import unicodedata
from typing import List

import cv2
import numpy as np
import torch
from fastapi import HTTPException
from pdf2image import convert_from_bytes
from PIL import Image, UnidentifiedImageError

from app.processing.handwriting_preprocess import preprocess_for_handwriting
from .model_loader import load_trocr
from app.utils import get_device

MAX_PDF_PAGES = 10
PDF_DPI = 200
MAX_LENGTH = 256

ALLOWED_EXTENSIONS = {".pdf", ".jpeg", ".jpg", ".png", ".heic", ".heif", ".tiff", ".webp"}
_SAFE_FILENAME_RE = re.compile(r"^[\w\-. ]+$")
_ocr_lock = threading.Lock()

def _sanitize_text(text: str) -> str:
    """Nettoie le texte extrait : normalisation NFKC et suppression des contrôles."""
    text = unicodedata.normalize("NFKC", text)
    return "".join(ch for ch in text if unicodedata.category(ch)[0] != "C" or ch in "\n\t")


def validate_filename(filename: str) -> str:
    """Valide et nettoie le nom de fichier uploadé."""
    if not filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant.")

    name = os.path.basename(filename).strip()
    if not name or not _SAFE_FILENAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extension non autorisée : {ext}",
        )
    return name


def bytes_to_images(content: bytes, filename: str) -> List[Image.Image]:
    """Convertit un fichier (PDF ou image) en une liste d'images PIL."""
    filename = (filename or "").lower()

    if filename.endswith(".pdf"):
        images = convert_from_bytes(content, dpi=PDF_DPI)
        if len(images) > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=413,
                detail=f"PDF trop volumineux : {len(images)} pages (max {MAX_PDF_PAGES}).",
            )
        return images

    try:
        img = Image.open(BytesIO(content))
        img = img.convert("RGB")
        return [img]
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Format image non supporté (jpg, png, pdf, heic).",
        )


def preprocess_images_for_handwriting(images: List[Image.Image]) -> List[Image.Image]:
    """Applique le pré-processing OpenCV puis reconvertit en PIL RGB pour TrOCR."""
    processed: List[Image.Image] = []
    for img in images:
        img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        bw = preprocess_for_handwriting(img_bgr)
        bw_rgb = cv2.cvtColor(bw, cv2.COLOR_GRAY2RGB)
        processed.append(Image.fromarray(bw_rgb))
    return processed


def trocr_ocr_images(images: List[Image.Image]) -> str:
    """Applique TrOCR sur une liste d'images et retourne le texte reconnu."""
    processor, model = load_trocr()
    device = get_device()
    texts: List[str] = []

    with _ocr_lock:
        with torch.no_grad():
            for img in images:
                pixel_values = processor(
                    images=img,
                    return_tensors="pt",
                ).pixel_values.to(device)

                generated_ids = model.generate(
                    pixel_values,
                    max_length=MAX_LENGTH,
                )

                text = processor.batch_decode(
                    generated_ids,
                    skip_special_tokens=True,
                )[0].strip()

                if text:
                    # Phase 3 : Sanitization
                    texts.append(_sanitize_text(text))

    return "\n".join(texts)
