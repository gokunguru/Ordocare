from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from .schemas import TranslateRequest, TranslateResponse
from .service import TranslationError, translate_text
from app.dependencies import verify_api_key

logger = logging.getLogger("ml_service")

router = APIRouter(prefix="/translation", tags=["translation"])


@router.get("/health")
def health():
    """Endpoint de santé — retourne uniquement le statut."""
    return {"status": "ok"}


@router.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, _: None = Depends(verify_api_key)):
    try:
        translated = translate_text(
            text=req.text,
            src_lang=req.src_lang,
            tgt_lang=req.tgt_lang,
            max_new_tokens=req.max_new_tokens,
        )
    except TranslationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Erreur inattendue lors de la traduction")
        raise HTTPException(status_code=500, detail="Erreur interne du service de traduction.")

    return TranslateResponse(
        translated_text=translated,
        provider="nllb200",
        src_lang=req.src_lang,
        tgt_lang=req.tgt_lang,
    )