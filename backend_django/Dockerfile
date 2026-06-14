# ══════════════════════════════════════════════════════════════════════════════
# OrdoCare Backend — Dockerfile
# Image multi-stage : build + production
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1 : Base Python ────────────────────────────────────────────────────
FROM python:3.10-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Dépendances système pour OCR, PDF, images et détection MIME
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fra \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    libmagic1 \
    libmagic-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*
# ── Stage 2 : Dépendances Python ────────────────────────────────────────────
FROM base AS dependencies

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 3 : Application ───────────────────────────────────────────────────
FROM dependencies AS app

COPY . .

# Créer le dossier media pour les uploads
RUN mkdir -p /app/media/uploads /app/media/reminder_photos

# Collecter les fichiers statiques
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

# Port par défaut
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/')" || exit 1

# Commande par défaut : Gunicorn en production
CMD ["gunicorn", "ordocare_dj.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "120"]
