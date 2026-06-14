from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Prescription


class Command(BaseCommand):
    help = "Delete expired prescriptions based on expiry_date"

    def handle(self, *args, **options):
        today = timezone.now().date()

        # Find all expired prescriptions
        expired_prescriptions = Prescription.objects.filter(expiry_date__isnull=False, expiry_date__lt=today)

        count = expired_prescriptions.count()

        if count > 0:
            # Delete expired prescriptions (cascades to reminders)
            expired_prescriptions.delete()
            self.stdout.write(self.style.SUCCESS(f"Successfully deleted {count} expired prescription(s)"))
        else:
            self.stdout.write(self.style.WARNING("No expired prescriptions found"))
