import hmac
import os

from fastapi import Header, HTTPException

# Clé API pour authentifier les appels depuis le backend Django
API_KEY = os.getenv("ML_API_KEY", "")

# Taille max des fichiers uploadés (20 Mo par défaut)
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20")) * 1024 * 1024


def verify_api_key(x_api_key: str = Header(default="")):
    """Vérifie la clé API — obligatoire en production."""
    if not API_KEY:
        raise HTTPException(status_code=500, detail="ML_API_KEY non configurée")
    if not x_api_key or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Clé API invalide")
