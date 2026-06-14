"""
Router OCR manuscrit — Endpoint FastAPI
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.dependencies import verify_api_key, MAX_UPLOAD_SIZE
from .schemas import OCRResponse
from .service import (
    validate_filename,
    bytes_to_images,
    preprocess_images_for_handwriting,
    trocr_ocr_images,
)

logger = logging.getLogger("ml_service")

router = APIRouter(tags=["ocr"])


@router.post("/predict-handwritten", response_model=OCRResponse)
async def predict_handwritten(
    file: UploadFile = File(...),
    _: None = Depends(verify_api_key),
) -> OCRResponse:
    """Endpoint principal d'OCR manuscrit via TrOCR."""
    start_time = time.time()

    if file is None:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    safe_name = validate_filename(file.filename)

    # Vérifier la taille AVANT de lire tout en mémoire (anti-DoS)
    if file.size and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux (max {MAX_UPLOAD_SIZE // (1024 * 1024)} Mo).",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide.")

    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux (max {MAX_UPLOAD_SIZE // (1024 * 1024)} Mo).",
        )

    try:
        images = bytes_to_images(content, safe_name)
        images = preprocess_images_for_handwriting(images)
        text = trocr_ocr_images(images)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erreur inattendue lors de l'OCR manuscrit")
        raise HTTPException(status_code=500, detail="Erreur interne du service OCR.")

    return OCRResponse(
        text=text,
        engine="trocr",
        processing_ms=int((time.time() - start_time) * 1000),
        pages=len(images),
    )
