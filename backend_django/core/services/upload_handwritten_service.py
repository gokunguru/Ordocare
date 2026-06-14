"""
Service d'upload d'ordonnance manuscrite — OrdoCare

Orchestre le pipeline complet :
    1. Sauvegarde du fichier
    2. Appel au microservice ML (TrOCR)
    3. Parsing des prescriptions
    4. Création automatique des rappels
"""

from __future__ import annotations

import logging
from typing import Any, Dict

import requests as http_requests
from django.conf import settings

from core.models import File, Prescription
from core.processing.prescription_parser import extract_all_prescriptions
from core.services.reminder_service import (
    create_auto_reminders,
    parse_duration,
    parse_frequency,
)

logger = logging.getLogger("ordocare")


class MLServiceError(Exception):
    """Levée quand le microservice ML est injoignable ou retourne une erreur."""


def process_handwritten_upload(*, user_id: int, file_obj) -> Dict[str, Any]:
    """
    Pipeline complet d'upload manuscrit.

    Retourne un dict prêt à être sérialisé en réponse API (même format
    que `upload_service.process_file_upload`).

    Raises:
        MLServiceError: si le microservice ML est indisponible.
    """
    # 1. Sauvegarder le fichier en base
    file_instance = File.objects.create(
        user_id=user_id,
        file=file_obj,
        filename=file_obj.name,
    )

    # 2. Appeler le microservice ML (TrOCR)
    ml_url = f"{settings.ML_SERVICE_URL}/predict-handwritten"
    ml_headers = {}
    ml_api_key = getattr(settings, "ML_API_KEY", "")
    if ml_api_key:
        ml_headers["X-Api-Key"] = ml_api_key

    try:
        with open(file_instance.file.path, "rb") as f:
            ml_response = http_requests.post(
                ml_url,
                files={"file": (file_instance.filename, f)},
                headers=ml_headers,
                timeout=60,
            )
        ml_response.raise_for_status()
        ocr_text = ml_response.json().get("text", "")
    except Exception as e:
        logger.error("Erreur microservice ML : %s", e)
        raise MLServiceError("Le service OCR manuscrit est indisponible") from e

    # 3. Parser les prescriptions depuis le texte OCR
    prescriptions_data = extract_all_prescriptions(ocr_text)
    prescriptions_payload = []
    total_reminders = 0

    for p in prescriptions_data:
        prescription = Prescription.objects.create(
            file=file_instance,
            medicine_name=p.get("medicament", ""),
            dosage_med=p.get("dosage_med", ""),
            quantite=p.get("quantite", ""),
            frequency=p.get("frequence", ""),
            duration=p.get("duree", ""),
            condition_si=p.get("condition_si", ""),
            condition=p.get("condition", ""),
        )
        times_per_day = parse_frequency(prescription.frequency) or 1
        num_days = parse_duration(prescription.duration) or 7
        reminders = create_auto_reminders(prescription, times_per_day, num_days)
        total_reminders += len(reminders)

        prescriptions_payload.append(
            {
                "id": prescription.id,
                "medicine_name": prescription.medicine_name,
                "dosage_med": prescription.dosage_med,
                "frequency": prescription.frequency,
                "duration": prescription.duration,
            }
        )

    return {
        "id": file_instance.id,
        "filename": file_instance.filename,
        "raw_text": ocr_text,
        "prescriptions": prescriptions_payload,
        "reminders_created": total_reminders,
    }
