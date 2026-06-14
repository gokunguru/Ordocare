"""
Serializers — Couche API

Sérialisation / désérialisation des données entre JSON et modèles Django.
Inclut les schémas de requête et de réponse pour la documentation Swagger/OpenAPI.
"""

from rest_framework import serializers

from core.models import (
    AppUser,
    File,
    MedicalProfile,
    Prescription,
    Reminder,
    Translation,
)

# ── Serializers de modèles (CRUD) ───────────────────────────────────────────


class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["id", "username", "email", "created_at"]


class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ["id", "user", "filename", "uploaded_at"]


class TranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Translation
        fields = [
            "id",
            "file",
            "original_text",
            "translated_text",
            "language_from",
            "language_to",
            "created_at",
        ]


class PrescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = [
            "id",
            "file",
            "medicine_name",
            "description",
            "dosage_med",
            "quantite",
            "frequency",
            "duration",
            "start_date",
            "expiry_date",
            "condition_si",
            "condition",
            "created_at",
        ]


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = [
            "id",
            "prescription",
            "reminder_time",
            "status",
            "notified",
            "photo",
            "created_at",
        ]


class MedicalProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalProfile
        fields = [
            "id",
            "user",
            "full_name",
            "birth_date",
            "gender",
            "blood_type",
            "height",
            "weight",
            "allergies",
            "chronic_conditions",
            "surgeries",
            "family_history",
            "emergency_contact_name",
            "emergency_contact_phone",
            "doctor_name",
            "doctor_phone",
            "insurance_company",
            "updated_at",
            "created_at",
        ]


# ── Serializers de requêtes (Swagger input schemas) ─────────────────────────


class RegisterSerializer(serializers.Serializer):
    """Schéma de requête pour l'inscription."""

    username = serializers.CharField(
        max_length=100,
        help_text="Nom d'utilisateur unique",
    )
    email = serializers.EmailField(
        max_length=150,
        help_text="Adresse email unique",
    )
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        help_text="Mot de passe (min. 8 caractères, lettres + chiffres)",
    )


class LoginSerializer(serializers.Serializer):
    """Schéma de requête pour la connexion."""

    username = serializers.CharField(
        max_length=100,
        help_text="Nom d'utilisateur",
    )
    password = serializers.CharField(
        write_only=True,
        min_length=1,
        help_text="Mot de passe",
    )


class ReminderCreateRequestSerializer(serializers.Serializer):
    """Schéma de requête pour la création manuelle d'un rappel."""

    prescription_id = serializers.IntegerField(
        help_text="ID de la prescription associée",
    )
    reminder_time = serializers.DateTimeField(
        help_text="Date et heure du rappel (format ISO 8601)",
    )


class ReminderUpdateRequestSerializer(serializers.Serializer):
    """Schéma de requête pour la mise à jour d'un rappel."""

    status = serializers.CharField(
        required=False,
        help_text="Nouveau statut (pending, taken, skipped)",
    )
    notified = serializers.BooleanField(
        required=False,
        help_text="Marquer comme notifié",
    )


# ── Serializers de réponses (Swagger output schemas) ────────────────────────


class AuthResponseSerializer(serializers.Serializer):
    """Schéma de réponse pour les endpoints d'authentification."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    access = serializers.CharField(help_text="JWT access token")
    refresh = serializers.CharField(help_text="JWT refresh token")


class ErrorResponseSerializer(serializers.Serializer):
    """Schéma de réponse pour les erreurs."""

    error = serializers.CharField(help_text="Message d'erreur descriptif")
