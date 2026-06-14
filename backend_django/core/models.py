import os
import uuid

from django.db import models
from encrypted_model_fields.fields import EncryptedCharField


class AppUser(models.Model):
    id = models.AutoField(primary_key=True)
    username = models.CharField(max_length=100, unique=True)
    email = models.EmailField(max_length=150, unique=True)
    password = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "users"
        app_label = "core"

    def __str__(self):
        return self.username

    @property
    def is_authenticated(self):
        """Requis par DRF IsAuthenticated — vérifie que le compte est actif."""
        return self.is_active

    @property
    def is_anonymous(self):
        return False


class File(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, db_column="user_id", related_name="files")

    def _get_upload_path(instance, filename):
        ext = filename.split(".")[-1]
        new_filename = f"{uuid.uuid4()}.{ext}"
        return os.path.join("uploads/", new_filename)

    file = models.FileField(upload_to=_get_upload_path)
    filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "files"
        app_label = "core"

    def __str__(self):
        return f"{self.filename} (user={self.user_id})"

    def save(self, *args, **kwargs):
        if self.file and not self.filename:
            self.filename = self.file.name
        super().save(*args, **kwargs)


class Translation(models.Model):
    id = models.AutoField(primary_key=True)
    file = models.ForeignKey(File, on_delete=models.CASCADE, db_column="file_id", related_name="translations")
    original_text = models.TextField()
    translated_text = models.TextField(null=True, blank=True)
    language_from = models.CharField(max_length=10, null=True, blank=True)
    language_to = models.CharField(max_length=10, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "translations"
        app_label = "core"

    def __str__(self):
        return f"Translation file={self.file_id} ({self.language_from}→{self.language_to})"


class Prescription(models.Model):
    id = models.AutoField(primary_key=True)

    file = models.ForeignKey(
        File,
        on_delete=models.CASCADE,
        db_column="file_id",
        related_name="prescriptions",
    )

    medicine_name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    dosage_med = models.CharField(max_length=100, null=True, blank=True)
    quantite = models.CharField(max_length=100, null=True, blank=True)
    frequency = models.CharField(max_length=100, null=True, blank=True)
    duration = models.CharField(max_length=100, null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    condition_si = models.CharField(max_length=255, null=True, blank=True)
    condition = models.CharField(max_length=255, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "prescriptions"
        app_label = "core"

    def __str__(self):
        return f"{self.medicine_name} ({self.dosage_med or 'N/A'})"


class ReminderStatus:
    """Constantes pour les statuts de rappel."""

    PENDING = "pending"
    TAKEN = "taken"
    SKIPPED = "skipped"

    CHOICES = [
        (PENDING, "En attente"),
        (TAKEN, "Pris"),
        (SKIPPED, "Ignoré"),
    ]


class Reminder(models.Model):
    id = models.AutoField(primary_key=True)
    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        db_column="prescription_id",
        related_name="reminders",
    )
    reminder_time = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=ReminderStatus.CHOICES,
        default=ReminderStatus.PENDING,
    )
    notified = models.BooleanField(default=False)
    photo = models.ImageField(upload_to="reminder_photos/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reminders"
        app_label = "core"

    def __str__(self):
        return f"Reminder {self.prescription.medicine_name} @ {self.reminder_time}"


class MedicalProfile(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.OneToOneField(
        AppUser,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="medical_profile",
    )

    full_name = models.CharField(max_length=255, null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)

    blood_type = models.CharField(max_length=10, null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    allergies = models.TextField(null=True, blank=True)
    chronic_conditions = models.TextField(null=True, blank=True)
    surgeries = models.TextField(null=True, blank=True)
    family_history = models.TextField(null=True, blank=True)

    emergency_contact_name = models.CharField(max_length=255, null=True, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, null=True, blank=True)
    doctor_name = models.CharField(max_length=255, null=True, blank=True)
    doctor_phone = models.CharField(max_length=20, null=True, blank=True)

    social_security_number = EncryptedCharField(max_length=15, null=True, blank=True)
    insurance_company = models.CharField(max_length=255, null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "medical_profiles"
        app_label = "core"

    def __str__(self):
        return f"Profil médical de {self.user.username}"
