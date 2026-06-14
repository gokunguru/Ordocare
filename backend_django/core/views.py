"""
API Views — OrdoCare

Principe : les vues orchestrent les requêtes HTTP sans contenir de logique métier.
La logique est déléguée aux services (core/services/).

Conventions REST appliquées :
    - Ressources au pluriel (users, files, reminders…)
    - Verbes HTTP = actions (GET lire, POST créer, PATCH modifier, DELETE supprimer)
    - Pas de verbe dans l'URI (ex: /reminders/ et non /reminders-create/)
    - Codes HTTP appropriés (200, 201, 204, 400, 401, 404, 409)
    - Documentation Swagger/OpenAPI sur chaque endpoint
"""

import logging
import os

import magic
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseForbidden
from rest_framework import status, viewsets
from rest_framework.decorators import (
    action,
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Limite les tentatives de connexion (protection brute-force)."""

    scope = "login"


class RegisterRateThrottle(AnonRateThrottle):
    """Limite les créations de compte (anti-spam)."""

    scope = "register"


from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema

from core.models import (
    AppUser,
    File,
    MedicalProfile,
    Prescription,
    Reminder,
    ReminderStatus,
    Translation,
)
from core.permissions import IsOwner
from core.serializers import (
    AppUserSerializer,
    AuthResponseSerializer,
    ErrorResponseSerializer,
    FileSerializer,
    LoginSerializer,
    MedicalProfileSerializer,
    PrescriptionSerializer,
    RegisterSerializer,
    ReminderCreateRequestSerializer,
    ReminderSerializer,
    ReminderUpdateRequestSerializer,
    TranslationSerializer,
)
from core.services.auth_service import (
    AuthenticationError,
    ConflictError,
    authenticate_user,
    change_user_password,
    register_user,
)
from core.services.upload_service import process_file_upload
from core.utils import build_medicine_summary

logger = logging.getLogger("ordocare")
security_logger = logging.getLogger("ordocare.security")

MAX_TRANSLATION_TEXT_LENGTH = 5000


def _validate_upload_file(file_obj):
    """Valide la taille et le type MIME d'un fichier uploadé. Retourne (ok, error_msg)."""
    max_size = getattr(settings, "MAX_UPLOAD_SIZE", 10 * 1024 * 1024)
    allowed_types = getattr(settings, "ALLOWED_UPLOAD_TYPES", set())

    if file_obj.size > max_size:
        return False, f"Fichier trop volumineux (max {max_size // (1024 * 1024)} Mo)"

    # Validation via python-magic (inspecte le contenu du fichier, pas juste l'extension)
    file_content = file_obj.read(2048)
    file_obj.seek(0)
    actual_mime = magic.from_buffer(file_content, mime=True)

    if allowed_types and actual_mime not in allowed_types:
        security_logger.warning(
            "Upload rejeté : type MIME suspect. Client : %s, Actuel : %s",
            file_obj.content_type,
            actual_mime,
        )
        return False, f"Type de fichier non autorisé : {actual_mime}"

    return True, None


# ─────────────────────────────────────────────────────────────────────────────
# ViewSets — CRUD automatique via DRF Router
# ─────────────────────────────────────────────────────────────────────────────


class AppUserViewSet(viewsets.ModelViewSet):
    """
    CRUD utilisateurs + sous-ressources (fichiers, prescriptions, rappels, profil médical).

    Endpoints générés par le Router :
        GET    /users/          → liste des utilisateurs
        POST   /users/          → créer un utilisateur
        GET    /users/{id}/     → détail d'un utilisateur
        PUT    /users/{id}/     → mise à jour complète
        PATCH  /users/{id}/     → mise à jour partielle
        DELETE /users/{id}/     → supprimer un utilisateur

    Actions personnalisées (sous-ressources REST) :
        GET    /users/{id}/files/            → fichiers de l'utilisateur
        GET    /users/{id}/prescriptions/    → prescriptions de l'utilisateur
        GET    /users/{id}/reminders/        → rappels de l'utilisateur
        GET    /users/{id}/medical-profile/  → profil médical
        PUT    /users/{id}/medical-profile/  → mise à jour profil médical
        PATCH  /users/{id}/medical-profile/  → mise à jour partielle profil médical
    """

    queryset = AppUser.objects.all().order_by("id")
    serializer_class = AppUserSerializer
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Liste les fichiers uploadés par l'utilisateur.",
        responses={200: FileSerializer(many=True)},
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="files",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def list_user_files(self, request, pk=None):
        """GET /users/{id}/files/ — Fichiers d'un utilisateur."""
        files = File.objects.filter(user_id=pk).order_by("-uploaded_at")
        serializer = FileSerializer(files, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        operation_description=(
            "Liste les prescriptions de l'utilisateur avec les informations " "du fichier source (ordonnance)."
        ),
        responses={200: PrescriptionSerializer(many=True)},
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="prescriptions",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def list_user_prescriptions(self, request, pk=None):
        """GET /users/{id}/prescriptions/ — Prescriptions d'un utilisateur."""
        files = File.objects.filter(user_id=pk)
        prescriptions = Prescription.objects.filter(file__in=files)
        serializer = PrescriptionSerializer(prescriptions, many=True)

        data = serializer.data
        file_map = {f.id: f.filename for f in files}
        for item in data:
            file_id = item["file"]
            item["file_info"] = {
                "id": file_id,
                "filename": file_map.get(file_id, "ordonnance"),
            }

        return Response(data, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        method="get",
        operation_description="Historique des ordonnances groupées par fichier uploadé.",
        tags=["users"],
    )
    @swagger_auto_schema(
        method="delete",
        operation_description="Supprime tout l'historique de l'utilisateur (ordonnances, prescriptions, rappels).",
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get", "delete"],
        url_path="history",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def list_user_history(self, request, pk=None):
        """GET/DELETE /users/{id}/history/ — Ordonnances groupées avec résumé."""

        if request.method == "DELETE":
            deleted_count = File.objects.filter(user_id=pk).delete()[0]
            return Response(
                {"message": f"{deleted_count} élément(s) supprimé(s)"},
                status=status.HTTP_200_OK,
            )

        files = File.objects.filter(user_id=pk).prefetch_related("prescriptions").order_by("-uploaded_at")
        history = []
        for f in files:
            prescriptions = list(f.prescriptions.all())

            history.append(
                {
                    "id": f.id,
                    "filename": f.filename,
                    "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "prescription_count": len(prescriptions),
                    "summary": build_medicine_summary(prescriptions),
                    "prescriptions": [
                        {
                            "id": p.id,
                            "medicine_name": p.medicine_name,
                            "dosage_med": p.dosage_med,
                            "frequency": p.frequency,
                            "duration": p.duration,
                        }
                        for p in prescriptions
                    ],
                }
            )

        return Response(history, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        operation_description=(
            "Rappels de l'utilisateur groupés par ordonnance. "
            "Chaque ordonnance contient ses prescriptions avec leurs rappels pending."
        ),
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="reminders",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def list_user_reminders(self, request, pk=None):
        """GET /users/{id}/reminders/ — Rappels groupés par ordonnance."""

        from django.db.models import Prefetch

        pending_prefetch = Prefetch(
            "prescriptions__reminders",
            queryset=Reminder.objects.filter(status=ReminderStatus.PENDING).order_by("reminder_time"),
            to_attr="pending_reminders",
        )
        files = (
            File.objects.filter(user_id=pk).prefetch_related("prescriptions", pending_prefetch).order_by("-uploaded_at")
        )
        result = []

        for f in files:
            prescriptions = list(f.prescriptions.all())
            if not prescriptions:
                continue

            summary = build_medicine_summary(prescriptions, default="Ordonnance")

            start_dates = [p.start_date for p in prescriptions if p.start_date]
            expiry_dates = [p.expiry_date for p in prescriptions if p.expiry_date]

            pres_list = []
            total_pending = 0
            for p in prescriptions:
                pending = p.pending_reminders
                next_reminder = pending[0] if pending else None
                pending_count = len(pending)
                total_pending += pending_count

                pres_list.append(
                    {
                        "id": p.id,
                        "medicine_name": p.medicine_name,
                        "dosage_med": p.dosage_med or "",
                        "frequency": p.frequency or "",
                        "duration": p.duration or "",
                        "pending_count": pending_count,
                        "next_reminder_id": next_reminder.id if next_reminder else None,
                        "next_reminder_time": (next_reminder.reminder_time.isoformat() if next_reminder else None),
                    }
                )

            if total_pending == 0:
                continue

            result.append(
                {
                    "file_id": f.id,
                    "summary": summary,
                    "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "start_date": min(start_dates).isoformat() if start_dates else None,
                    "expiry_date": (max(expiry_dates).isoformat() if expiry_dates else None),
                    "total_pending": total_pending,
                    "prescriptions": pres_list,
                }
            )

        return Response(result, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        operation_description=(
            "Traductions de l'utilisateur groupées par ordonnance. "
            "Seules les ordonnances ayant au moins une traduction sont retournées."
        ),
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="translations",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def list_user_translations(self, request, pk=None):
        """GET /users/{id}/translations/ — Traductions groupées par ordonnance."""

        from django.db.models import Prefetch

        translations_prefetch = Prefetch(
            "translations",
            queryset=Translation.objects.order_by("-created_at"),
        )
        files = (
            File.objects.filter(user_id=pk)
            .prefetch_related("prescriptions", translations_prefetch)
            .order_by("-uploaded_at")
        )
        result = []

        for f in files:
            translations = list(f.translations.all())
            if not translations:
                continue

            prescriptions = list(f.prescriptions.all())

            result.append(
                {
                    "file_id": f.id,
                    "filename": f.filename,
                    "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "summary": build_medicine_summary(prescriptions, default="Ordonnance"),
                    "prescriptions": [
                        {
                            "id": p.id,
                            "medicine_name": p.medicine_name,
                            "dosage_med": p.dosage_med or "",
                            "frequency": p.frequency or "",
                        }
                        for p in prescriptions
                    ],
                    "translations": [
                        {
                            "id": t.id,
                            "original_text": t.original_text,
                            "translated_text": t.translated_text,
                            "language_from": t.language_from,
                            "language_to": t.language_to,
                            "created_at": (t.created_at.isoformat() if t.created_at else None),
                        }
                        for t in translations
                    ],
                }
            )

        return Response(result, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        methods=["get"],
        operation_description=(
            "Récupère le profil médical de l'utilisateur. "
            "Un profil vide est créé automatiquement s'il n'existe pas encore."
        ),
        responses={200: MedicalProfileSerializer, 404: ErrorResponseSerializer},
        tags=["users"],
    )
    @swagger_auto_schema(
        methods=["put"],
        operation_description="Mise à jour complète du profil médical.",
        request_body=MedicalProfileSerializer,
        responses={200: MedicalProfileSerializer, 400: ErrorResponseSerializer},
        tags=["users"],
    )
    @swagger_auto_schema(
        methods=["patch"],
        operation_description="Mise à jour partielle du profil médical.",
        request_body=MedicalProfileSerializer,
        responses={200: MedicalProfileSerializer, 400: ErrorResponseSerializer},
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["get", "put", "patch"],
        url_path="medical-profile",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def medical_profile(self, request, pk=None):
        """GET/PUT/PATCH /users/{id}/medical-profile/ — Profil médical."""
        try:
            user = AppUser.objects.get(id=pk)
        except AppUser.DoesNotExist:
            return Response(
                {"error": "Utilisateur non trouvé"},
                status=status.HTTP_404_NOT_FOUND,
            )

        profile, _ = MedicalProfile.objects.get_or_create(user=user)

        if request.method == "GET":
            serializer = MedicalProfileSerializer(profile)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # PUT ou PATCH
        partial = request.method == "PATCH"
        serializer = MedicalProfileSerializer(
            profile,
            data=request.data,
            partial=partial,
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @swagger_auto_schema(
        operation_description="Changement de mot de passe de l'utilisateur.",
        tags=["users"],
    )
    @action(
        detail=True,
        methods=["patch"],
        url_path="change-password",
        permission_classes=[IsAuthenticated, IsOwner],
    )
    def change_password(self, request, pk=None):
        """PATCH /users/{id}/change-password/ — Changer le mot de passe."""
        try:
            result = change_user_password(
                user_id=int(pk),
                current_password=request.data.get("current_password", ""),
                new_password=request.data.get("new_password", ""),
            )
            return Response(result, status=status.HTTP_200_OK)
        except AuthenticationError as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FileViewSet(viewsets.ModelViewSet):
    """
    CRUD fichiers + actions download et upload.

    Endpoints :
        GET    /files/               → liste des fichiers (filtrés par utilisateur)
        GET    /files/{id}/          → détail d'un fichier
        GET    /files/{id}/download/ → télécharger le fichier physique
        POST   /files/upload/        → uploader une ordonnance (déclenche OCR + extraction)
        POST   /files/upload-handwritten/ → uploader une ordonnance manuscrite (TrOCR)
    """

    serializer_class = FileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filtre les fichiers par utilisateur authentifié (IDOR protection)."""
        if self.request.user and self.request.user.is_authenticated:
            return File.objects.filter(user_id=self.request.user.id).order_by("id")
        return File.objects.none()

    @swagger_auto_schema(
        operation_description="Télécharge le fichier physique associé à l'entrée en base.",
        responses={
            200: openapi.Response("Fichier binaire en téléchargement"),
            404: ErrorResponseSerializer,
        },
        tags=["files"],
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="download",
        permission_classes=[IsAuthenticated],
    )
    def download(self, request, pk=None):
        """GET /files/{id}/download/ — Télécharger un fichier."""
        try:
            file_obj = self.get_queryset().get(id=pk)
        except File.DoesNotExist:
            return Response(
                {"error": "Fichier introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        file_path = file_obj.file.path

        # Protection path traversal : vérifier que le fichier est sous MEDIA_ROOT
        media_root = os.path.realpath(settings.MEDIA_ROOT)
        real_path = os.path.realpath(file_path)
        if not real_path.startswith(media_root):
            security_logger.warning("Path traversal attempt: user=%d, path=%s", request.user.id, file_path)
            return Response(
                {"error": "Accès interdit"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not os.path.exists(real_path):
            return Response(
                {"error": "Le fichier n'existe plus sur le serveur"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            open(real_path, "rb"),
            as_attachment=True,
            filename=os.path.basename(file_obj.filename),
        )

    @swagger_auto_schema(
        operation_description=(
            "Upload d'une ordonnance avec traitement automatique :\n"
            "1. Sauvegarde du fichier\n"
            "2. Extraction OCR du texte (PDF via pdfplumber, images via Tesseract)\n"
            "3. Parsing des prescriptions via expressions régulières\n"
            "4. Génération automatique des rappels selon fréquence et durée"
        ),
        manual_parameters=[
            openapi.Parameter(
                "file",
                openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="Fichier ordonnance (PDF, JPG, PNG)",
                required=True,
            ),
        ],
        responses={
            201: openapi.Response(
                "Fichier uploadé avec prescriptions extraites et rappels créés",
            ),
            400: ErrorResponseSerializer,
        },
        tags=["files"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="upload",
        parser_classes=[MultiPartParser, FormParser],
        permission_classes=[IsAuthenticated],
    )
    def upload(self, request):
        """POST /files/upload/ — Upload d'ordonnance avec OCR."""
        file_obj = request.FILES.get("file")

        if not file_obj:
            return Response(
                {"error": "Aucun fichier envoyé"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid, error_msg = _validate_upload_file(file_obj)
        if not valid:
            return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        user_id = request.user.id

        response = process_file_upload(user_id=user_id, file_obj=file_obj)
        return Response(response, status=status.HTTP_201_CREATED)

    @swagger_auto_schema(
        operation_description=(
            "Upload d'une ordonnance manuscrite avec OCR via TrOCR :\n"
            "1. Sauvegarde du fichier\n"
            "2. Envoi au microservice ML (TrOCR) pour reconnaissance d'écriture\n"
            "3. Parsing des prescriptions extraites\n"
            "4. Génération automatique des rappels"
        ),
        manual_parameters=[
            openapi.Parameter(
                "file",
                openapi.IN_FORM,
                type=openapi.TYPE_FILE,
                description="Image ordonnance manuscrite (JPG, PNG, HEIC)",
                required=True,
            ),
        ],
        responses={
            201: openapi.Response(
                "Fichier uploadé avec OCR manuscrit et prescriptions extraites",
            ),
            400: ErrorResponseSerializer,
            502: ErrorResponseSerializer,
        },
        tags=["files"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="upload-handwritten",
        parser_classes=[MultiPartParser, FormParser],
        permission_classes=[IsAuthenticated],
    )
    def upload_handwritten(self, request):
        """POST /files/upload-handwritten/ — Upload d'ordonnance manuscrite (TrOCR)."""
        from core.services.upload_handwritten_service import (
            MLServiceError,
            process_handwritten_upload,
        )

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"error": "Aucun fichier envoyé"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid, error_msg = _validate_upload_file(file_obj)
        if not valid:
            return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response_data = process_handwritten_upload(
                user_id=request.user.id,
                file_obj=file_obj,
            )
        except MLServiceError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(response_data, status=status.HTTP_201_CREATED)


class TranslationViewSet(viewsets.ModelViewSet):
    """CRUD traductions de texte médical (filtrées par utilisateur)."""

    serializer_class = TranslationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user and self.request.user.is_authenticated:
            return Translation.objects.filter(file__user_id=self.request.user.id).order_by("id")
        return Translation.objects.none()


class PrescriptionViewSet(viewsets.ModelViewSet):
    """CRUD prescriptions médicales (filtrées par utilisateur)."""

    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user and self.request.user.is_authenticated:
            return Prescription.objects.filter(file__user_id=self.request.user.id).order_by("id")
        return Prescription.objects.none()


class ReminderViewSet(viewsets.ModelViewSet):
    """
    CRUD rappels de médicaments (filtrés par utilisateur).

    Les rappels sont générés automatiquement lors de l'upload d'ordonnance,
    mais peuvent aussi être créés/modifiés/supprimés manuellement.
    """

    serializer_class = ReminderSerializer
    permission_classes = [IsAuthenticated]

    VALID_STATUSES = {s[0] for s in ReminderStatus.CHOICES}

    def get_queryset(self):
        """Filtre les rappels par utilisateur authentifié (IDOR protection)."""
        if self.request.user and self.request.user.is_authenticated:
            return Reminder.objects.filter(prescription__file__user_id=self.request.user.id).order_by("id")
        return Reminder.objects.none()

    @swagger_auto_schema(
        request_body=ReminderCreateRequestSerializer,
        responses={
            201: ReminderSerializer,
            400: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        operation_description="Crée un nouveau rappel pour une prescription existante.",
        tags=["reminders"],
    )
    def create(self, request, *args, **kwargs):
        """POST /reminders/ — Créer un rappel."""
        prescription_id = request.data.get("prescription_id")
        reminder_time = request.data.get("reminder_time")

        if not prescription_id or not reminder_time:
            return Response(
                {"error": "Les champs prescription_id et reminder_time sont requis"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            prescription = Prescription.objects.get(
                id=prescription_id,
                file__user_id=request.user.id,
            )
        except Prescription.DoesNotExist:
            return Response(
                {"error": "Prescription non trouvée"},
                status=status.HTTP_404_NOT_FOUND,
            )

        reminder = Reminder.objects.create(
            prescription=prescription,
            reminder_time=reminder_time,
            status=ReminderStatus.PENDING,
            notified=False,
        )
        serializer = ReminderSerializer(reminder)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @swagger_auto_schema(
        request_body=ReminderUpdateRequestSerializer,
        responses={
            200: ReminderSerializer,
            404: ErrorResponseSerializer,
        },
        operation_description=(
            "Met à jour un rappel existant (statut, notification, photo). "
            "Utiliser PATCH pour une mise à jour partielle."
        ),
        tags=["reminders"],
    )
    def partial_update(self, request, *args, **kwargs):
        """PATCH /reminders/{id}/ — Mettre à jour un rappel."""
        reminder = self.get_object()

        new_status = request.data.get("status")
        if new_status:
            if new_status not in self.VALID_STATUSES:
                return Response(
                    {"error": f"Statut invalide. Valeurs acceptées : {', '.join(self.VALID_STATUSES)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            reminder.status = new_status

        notified = request.data.get("notified")
        if notified is not None:
            reminder.notified = notified

        if "photo" in request.FILES:
            reminder.photo = request.FILES["photo"]

        reminder.save()
        serializer = ReminderSerializer(reminder)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        responses={
            204: "Rappel supprimé avec succès (pas de contenu retourné)",
            404: ErrorResponseSerializer,
        },
        operation_description=(
            "Supprime un rappel. Retourne HTTP 204 No Content " "(convention REST pour les suppressions réussies)."
        ),
        tags=["reminders"],
    )
    def destroy(self, request, *args, **kwargs):
        """DELETE /reminders/{id}/ — Supprimer un rappel (HTTP 204)."""
        reminder = self.get_object()
        reminder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints d'authentification (hors CRUD — actions métier)
# ─────────────────────────────────────────────────────────────────────────────


@swagger_auto_schema(
    method="post",
    request_body=RegisterSerializer,
    responses={
        201: AuthResponseSerializer,
        400: ErrorResponseSerializer,
        409: ErrorResponseSerializer,
    },
    operation_description=(
        "Inscription d'un nouvel utilisateur.\n\n"
        "Retourne les informations du compte créé ainsi que les tokens JWT "
        "(access + refresh) pour une connexion immédiate.\n\n"
        "**Codes de retour :**\n"
        "- `201` : Inscription réussie\n"
        "- `400` : Champs manquants\n"
        "- `409` : Username ou email déjà utilisé"
    ),
    tags=["auth"],
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([RegisterRateThrottle])
def register(request):
    """POST /auth/register/ — Inscription (délègue au service d'authentification)."""
    try:
        result = register_user(
            username=request.data.get("username"),
            email=request.data.get("email"),
            password=request.data.get("password"),
        )
        return Response(result, status=status.HTTP_201_CREATED)
    except ConflictError as e:
        return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method="post",
    request_body=LoginSerializer,
    responses={
        200: AuthResponseSerializer,
        400: ErrorResponseSerializer,
        401: ErrorResponseSerializer,
    },
    operation_description=(
        "Connexion d'un utilisateur existant.\n\n"
        "Retourne les informations du compte ainsi que les tokens JWT "
        "(access + refresh).\n\n"
        "**Codes de retour :**\n"
        "- `200` : Connexion réussie\n"
        "- `400` : Champs manquants\n"
        "- `401` : Identifiants invalides"
    ),
    tags=["auth"],
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login(request):
    """POST /auth/login/ — Connexion (délègue au service d'authentification)."""
    username = request.data.get("username")
    try:
        result = authenticate_user(
            username=username,
            password=request.data.get("password"),
        )
        return Response(result, status=status.HTTP_200_OK)
    except AuthenticationError:
        security_logger.warning(
            "Échec authentification : username=%s, ip=%s",
            username or "(vide)",
            request.META.get("REMOTE_ADDR", "unknown"),
        )
        return Response(
            {"error": "Identifiants invalides"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints de traduction (microservice NLLB)
# ─────────────────────────────────────────────────────────────────────────────


@swagger_auto_schema(
    method="get",
    operation_description="Liste des langues disponibles pour la traduction.",
    responses={200: "Liste des langues au format [{code, name}]"},
    tags=["translation"],
)
@api_view(["GET"])
@permission_classes([AllowAny])
def translation_languages(request):
    """GET /translation/languages/ — Langues disponibles pour la traduction."""
    try:
        from core.services.translation.language_catalog import list_language_options

        return Response(list_language_options(), status=status.HTTP_200_OK)
    except ImportError:
        return Response(
            {"error": "Module de traduction non disponible"},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


@swagger_auto_schema(
    method="post",
    operation_description="Traduit un texte médical via le microservice NLLB-200.",
    responses={
        200: openapi.Response(
            description="Texte traduit",
            examples={
                "application/json": {
                    "translated_text": "Take one tablet per day",
                    "provider": "nllb",
                    "src_lang": "fra_Latn",
                    "tgt_lang": "eng_Latn",
                }
            },
        ),
        400: ErrorResponseSerializer,
        502: ErrorResponseSerializer,
    },
    tags=["translation"],
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def translate_endpoint(request):
    """POST /translation/translate/ — Traduire un texte médical."""
    try:
        from core.services.translation.translation_service import (
            TranslationServiceError,
            translate_text,
        )
    except ImportError:
        return Response(
            {"error": "Module de traduction non disponible"},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )

    text = request.data.get("text", "")
    src_lang = request.data.get("src_lang", "")
    tgt_lang = request.data.get("tgt_lang", "")

    if not text or not text.strip():
        return Response(
            {"error": "text is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not src_lang or not tgt_lang:
        return Response(
            {"error": "src_lang and tgt_lang are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(text) > MAX_TRANSLATION_TEXT_LENGTH:
        return Response(
            {"error": f"Texte trop long (max {MAX_TRANSLATION_TEXT_LENGTH} caractères)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = translate_text(
            text=text,
            src_lang=src_lang,
            tgt_lang=tgt_lang,
        )
    except TranslationServiceError as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {
            "translated_text": result.translated_text,
            "provider": result.provider,
            "src_lang": result.src_lang,
            "tgt_lang": result.tgt_lang,
        },
        status=status.HTTP_200_OK,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Media protégés
# ─────────────────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def serve_protected_media(request, path):
    """
    Sert les fichiers média en vérifiant les permissions.
    Protection contre path traversal + contrôle propriétaire.
    """

    file_path = os.path.join(settings.MEDIA_ROOT, path)

    # Protection path traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(settings.MEDIA_ROOT)):
        return HttpResponseForbidden("Accès refusé.")

    # Vérification propriétaire si fichier upload
    if path.startswith("uploads/"):
        from core.models import File

        filename = os.path.basename(path)

        try:
            file_obj = File.objects.get(file__icontains=filename)

            if file_obj.user != request.user and not request.user.is_staff:
                security_logger.warning(
                    "Accès non autorisé fichier %s par user %s",
                    path,
                    request.user.id,
                )
                return HttpResponseForbidden("Accès interdit.")

        except File.DoesNotExist:
            return HttpResponseForbidden("Fichier non référencé.")

    if not os.path.exists(file_path):
        raise Http404("Fichier introuvable.")

    content_type = magic.from_file(file_path, mime=True)

    return FileResponse(
        open(file_path, "rb"),
        content_type=content_type,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """Endpoint de santé pour Docker / monitoring."""
    return Response({"status": "ok"}, status=status.HTTP_200_OK)
