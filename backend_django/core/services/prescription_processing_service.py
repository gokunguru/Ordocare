# backend_django/core/services/prescription_processing_service.py

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.utils import timezone

from core.models import File, Prescription
from core.processing.abbrev_expander import (
    build_sig_expanded,
    expand_duration,
    expand_frequency,
    expand_quantite,
)
from core.processing.prescription_parser import extract_all_prescriptions
from core.services.reminder_service import (
    create_auto_reminders,
    parse_duration,
    parse_frequency,
)


@dataclass(frozen=True)
class PrescriptionProcessingResult:
    prescriptions_payload: list[dict[str, Any]]
    reminders_created: int


def process_ocr_text(*, file_instance: File, ocr_text: str) -> PrescriptionProcessingResult:
    """
    Transforme un texte OCR brut en :
    - Prescriptions sauvegardées en base
    - Rappels automatiques
    - Payload normalisé identique à celui renvoyé par l'API
    """
    prescriptions = extract_all_prescriptions(ocr_text)

    pres_objects: list[Prescription] = []
    reminders_created = 0

    for p in prescriptions:
        frequency_str = p.get("frequence", "")
        duration_str = p.get("duree", "")
        quantite_str = p.get("quantite", "")

        expiry_date = None
        num_days = parse_duration(duration_str)
        if num_days:
            expiry_date = (timezone.now() + timedelta(days=num_days)).date()

        prescription = Prescription.objects.create(
            file=file_instance,
            medicine_name=p.get("medicament", ""),
            description=p.get("description", ""),
            dosage_med=p.get("dosage_med", ""),
            quantite=quantite_str,
            frequency=frequency_str,
            duration=duration_str,
            start_date=timezone.now().date(),
            expiry_date=expiry_date,
            condition_si=p.get("condition_si", ""),
            condition=p.get("condition", ""),
        )
        pres_objects.append(prescription)

        # Rappels auto
        if frequency_str and duration_str:
            times_per_day = parse_frequency(frequency_str)
            num_days = parse_duration(duration_str)
            if times_per_day and num_days:
                created = create_auto_reminders(prescription, times_per_day, num_days)
                reminders_created += len(created)

    prescriptions_payload = [
        {
            "medicine_name": p.medicine_name,
            "dosage_med": p.dosage_med,
            "quantite": p.quantite,
            "frequency": p.frequency,
            "duration": p.duration,
            "condition_si": p.condition_si,
            "condition": p.condition,
            "description": p.description,
            "quantite_expanded": expand_quantite(p.quantite or ""),
            "frequency_expanded": expand_frequency(p.frequency or ""),
            "duration_expanded": expand_duration(p.duration or ""),
            "sig_expanded": build_sig_expanded(
                p.quantite or "",
                p.frequency or "",
                p.duration or "",
                p.condition_si or "",
                p.condition or "",
            ),
        }
        for p in pres_objects
    ]

    return PrescriptionProcessingResult(
        prescriptions_payload=prescriptions_payload,
        reminders_created=reminders_created,
    )
