import re
from datetime import timedelta
from typing import List

from django.utils import timezone

from core.models import Prescription, Reminder, ReminderStatus


def parse_frequency(frequency_str: str | None) -> int | None:
    """
    Parse une chaîne de fréquence pour obtenir le nombre de prises par jour.
    Exemples: "3 fois par jour" → 3, "2/j" → 2, "matin et soir" → 2
    """
    if not frequency_str:
        return None

    frequency_str = frequency_str.lower()

    # Pattern: "3 fois par jour"
    match = re.search(r"(\d+)\s*fois\s*par\s*jour", frequency_str)
    if match:
        return int(match.group(1))

    # Pattern: "3/j" or "3/jour"
    match = re.search(r"(\d+)\s*/\s*j", frequency_str)
    if match:
        return int(match.group(1))

    # Nommés
    if "matin et soir" in frequency_str or "matin midi soir" in frequency_str:
        if "midi" in frequency_str:
            return 3
        return 2

    return None


def parse_duration(duration_str: str | None) -> int | None:
    """
    Parse une chaîne de durée pour obtenir le nombre de jours.
    Exemples: "7 jours" → 7, "2 semaines" → 14, "1 mois" → 30
    """
    if not duration_str:
        return None

    duration_str = duration_str.lower()

    # Pattern: "7 jours" or "7 j"
    match = re.search(r"(\d+)\s*(?:jour|jours|j\b)", duration_str)
    if match:
        return int(match.group(1))

    # Pattern: "2 semaines" or "2 sem"
    match = re.search(r"(\d+)\s*(?:semaine|semaines|sem)", duration_str)
    if match:
        return int(match.group(1)) * 7

    # Pattern: "1 mois"
    match = re.search(r"(\d+)\s*mois", duration_str)
    if match:
        return int(match.group(1)) * 30

    return None


def create_auto_reminders(
    prescription: Prescription, times_per_day: int | None, num_days: int | None
) -> List[Reminder]:
    """
    Crée automatiquement des rappels pour une prescription.
    Args:
        prescription: Objet Prescription
        times_per_day: Nombre de prises par jour
        num_days: Durée totale en jours
    """
    if not times_per_day or not num_days:
        return []

    # Créneaux par défaut dans la journée
    time_slots = {
        1: ["08:00"],
        2: ["08:00", "20:00"],
        3: ["08:00", "14:00", "20:00"],
        4: ["08:00", "12:00", "16:00", "20:00"],
    }

    times = time_slots.get(times_per_day, ["08:00"] * times_per_day)

    reminders: List[Reminder] = []
    now = timezone.now()
    start_date = now

    for day in range(num_days):
        current_date = start_date + timedelta(days=day)

        for time_str in times:
            hour, minute = map(int, time_str.split(":"))
            reminder_datetime = current_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

            # Ne créer que des rappels futurs
            if reminder_datetime > now:
                reminder = Reminder.objects.create(
                    prescription=prescription,
                    reminder_time=reminder_datetime,
                    status=ReminderStatus.PENDING,
                    notified=False,
                )
                reminders.append(reminder)

    return reminders
