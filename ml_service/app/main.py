"""
OrdoCare ML Service — Point d'entrée FastAPI

Application allégée : setup, middleware, inclusion des routers.
La logique métier est dans les modules ocr/ et translation/.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import pillow_heif
pillow_heif.register_heif_opener()

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.translation.router import router as translation_router
from app.ocr.router import router as ocr_router

logger = logging.getLogger("ml_service")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pré-charge les modèles lourds au démarrage."""
    from app.translation.model_loader import get_nllb_bundle
    logger.info("Pré-chargement du modèle NLLB...")
    get_nllb_bundle()
    logger.info("Modèle NLLB prêt.")
    yield


limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
app = FastAPI(
    title="Ordocare ML Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if os.getenv("ENVIRONMENT") == "production" else "/docs",
    redoc_url=None if os.getenv("ENVIRONMENT") == "production" else "/redoc",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

@app.middleware("http")
async def limit_content_length(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        max_size = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20")) * 1024 * 1024
        if content_length and int(content_length) > max_size:
            return Response(content="Payload Too Large", status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    return await call_next(request)

# CORS — restricted to backend origin
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)

app.include_router(translation_router)
app.include_router(ocr_router)


@app.get("/health")
def health() -> dict:
    """Endpoint de santé."""
    return {"status": "ok"}
