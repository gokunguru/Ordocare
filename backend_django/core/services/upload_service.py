from __future__ import annotations

import logging
import os
import subprocess
from datetime import timedelta
from typing import Dict, List

from django.db import transaction
from django.utils import timezone

from core.models import File, Prescription
from core.processing.prescription_parser import (
    extract_all_prescriptions,
    extract_text_from_pdf,
)
from core.services.reminder_service import (
    create_auto_reminders,
    parse_duration,
    parse_frequency,
)

logger = logging.getLogger("ordocare")


def _detect_file_type(file_path: str) -> str:
    """Détecte le type de fichier par ses magic bytes (pas par extension)."""
    with open(file_path, "rb") as f:
        header = f.read(8)
    if header[:4] == b"%PDF":
        return "pdf"
    if header[:3] == b"\xff\xd8\xff":
        return "image"  # JPEG
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return "image"  # PNG
    if header[:4] in (b"RIFF", b"II\x2a\x00", b"MM\x00\x2a"):
        return "image"  # WebP, TIFF
    # HEIF/HEIC
    if len(header) >= 8 and header[4:8] == b"ftyp":
        return "image"
    return "unknown"


def _ocr_image(file_path: str) -> str:
    """OCR via Tesseract pour images imprimées."""
    tesseract_cmd = os.getenv("TESSERACT_CMD", "tesseract")
    result = subprocess.run(
        [tesseract_cmd, file_path, "stdout", "-l", "fra"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        logger.error("Tesseract error: %s", result.stderr)
        return ""
    return result.stdout


@transaction.atomic
def process_file_upload(user_id: int, file_obj) -> Dict:
    """
    Orchestration de l'upload d'un fichier d'ordonnance:
    - Crée l'entrée File
    - Extrait le texte (PDF ou Image)
    - Extrait les prescriptions via regex/processing
    - Persiste les prescriptions
    - Crée automatiquement les rappels selon fréquence/durée
    - Retourne une réponse enrichie
    """
    # 1) Créer l'entrée Fichier
    file_instance = File.objects.create(
        user_id=user_id,
        file=file_obj,
        filename=file_obj.name,
    )
    logger.info(
        "Fichier créé : id=%d, filename=%s, user=%d",
        file_instance.id,
        file_instance.filename,
        user_id,
    )

    # 2) EXTRACTION TEXTE — détection par contenu (pas par extension)
    text = ""
    file_path = file_instance.file.path
    file_type = _detect_file_type(file_path)
    logger.info(
        "Type détecté : %s pour fichier %d (%s)",
        file_type,
        file_instance.id,
        file_instance.filename,
    )

    try:
        if file_type == "pdf":
            text = extract_text_from_pdf(file_path)
        elif file_type == "image":
            text = _ocr_image(file_path)
        else:
            logger.warning("Type non supporté : %s (fichier %d)", file_type, file_instance.id)
    except Exception as e:
        logger.error(
            "Erreur OCR pour fichier %d (%s) : %s",
            file_instance.id,
            file_instance.filename,
            str(e),
            exc_info=True,
        )
        text = ""

    # 3) Extraction des prescriptions via REGEX
    prescriptions_data = extract_all_prescriptions(text)
    logger.info(
        "Prescriptions extraites : %d pour fichier %d",
        len(prescriptions_data),
        file_instance.id,
    )

    # 4) Sauvegarde en base + création automatique des rappels
    pres_objects: List[Prescription] = []
    reminders_created = 0

    for p in prescriptions_data:
        frequency_str = p.get("frequence", "")
        duration_str = p.get("duree", "")

        num_days = parse_duration(duration_str) or 7
        expiry_date = (timezone.now() + timedelta(days=num_days)).date()

        prescription = Prescription.objects.create(
            file=file_instance,
            medicine_name=p.get("medicament", ""),
            description=p.get("description", ""),
            dosage_med=p.get("dosage_med", ""),
            quantite=p.get("quantite", ""),
            frequency=frequency_str,
            duration=duration_str,
            start_date=timezone.now().date(),
            expiry_date=expiry_date,
            condition_si=p.get("condition_si", ""),
            condition=p.get("condition", ""),
        )
        pres_objects.append(prescription)

        # Création des rappels — fallback 1x/jour pendant 7 jours si non détecté
        times_per_day = parse_frequency(frequency_str) or 1
        num_days_rem = parse_duration(duration_str) or 7

        created_reminders = create_auto_reminders(prescription, times_per_day, num_days_rem)
        reminders_created += len(created_reminders)

    logger.info("Rappels créés : %d pour fichier %d", reminders_created, file_instance.id)

    # 5) Réponse enrichie
    return {
        "id": file_instance.id,
        "user": file_instance.user_id,
        "filename": file_instance.filename,
        "file": file_instance.file.url if hasattr(file_instance.file, "url") else "",
        "uploaded_at": (file_instance.uploaded_at.isoformat() if file_instance.uploaded_at else None),
        "raw_text": text,
        "prescriptions": [
            {
                "medicine_name": p.medicine_name,
                "dosage_med": p.dosage_med,
                "quantite": p.quantite,
                "frequency": p.frequency,
                "duration": p.duration,
                "condition_si": p.condition_si,
                "condition": p.condition,
                "description": p.description,
            }
            for p in pres_objects
        ],
        "reminders_created": reminders_created,
    }
