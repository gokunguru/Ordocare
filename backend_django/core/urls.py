"""
Routage API — OrdoCare

Conventions REST appliquées :
    - Ressources au pluriel, pas de verbes dans les URIs
    - Sous-ressources pour les relations (users/{id}/files/, users/{id}/reminders/)
    - Namespace auth/ pour l'authentification
    - Versioning géré au niveau supérieur (ordocare_dj/urls.py → /api/v1/)

Structure des URLs :
    /api/v1/auth/register/                  POST    → Inscription
    /api/v1/auth/login/                     POST    → Connexion

    /api/v1/users/                          GET     → Liste utilisateurs
    /api/v1/users/{id}/                     GET     → Détail utilisateur
    /api/v1/users/{id}/files/               GET     → Fichiers de l'utilisateur
    /api/v1/users/{id}/prescriptions/       GET     → Prescriptions de l'utilisateur
    /api/v1/users/{id}/reminders/           GET     → Rappels de l'utilisateur
    /api/v1/users/{id}/medical-profile/     GET/PUT/PATCH → Profil médical

    /api/v1/files/                          GET     → Liste fichiers
    /api/v1/files/{id}/                     GET     → Détail fichier
    /api/v1/files/{id}/download/            GET     → Télécharger fichier
    /api/v1/files/upload/                   POST    → Upload ordonnance + OCR
    /api/v1/files/upload-handwritten/       POST    → Upload ordonnance manuscrite (TrOCR)

    /api/v1/prescriptions/                  GET     → Liste prescriptions
    /api/v1/prescriptions/{id}/             GET     → Détail prescription

    /api/v1/reminders/                      GET     → Liste rappels
    /api/v1/reminders/                      POST    → Créer rappel
    /api/v1/reminders/{id}/                 GET     → Détail rappel
    /api/v1/reminders/{id}/                 PATCH   → Modifier rappel
    /api/v1/reminders/{id}/                 DELETE  → Supprimer rappel (204)

    /api/v1/translations/                   CRUD    → Traductions

    /api/v1/translation/languages/          GET     → Langues disponibles
    /api/v1/translation/translate/          POST    → Traduire un texte
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from core.views import (
    AppUserViewSet,
    FileViewSet,
    PrescriptionViewSet,
    ReminderViewSet,
    TranslationViewSet,
    health_check,
    login,
    register,
    serve_protected_media,
    translate_endpoint,
    translation_languages,
)

# Router DRF — génère automatiquement les URLs CRUD + actions
router = DefaultRouter()
router.register(r"users", AppUserViewSet)
router.register(r"files", FileViewSet, basename="file")
router.register(r"translations", TranslationViewSet, basename="translation")
router.register(r"prescriptions", PrescriptionViewSet, basename="prescription")
router.register(r"reminders", ReminderViewSet, basename="reminder")

urlpatterns = [
    # CRUD + actions via Router
    path("", include(router.urls)),
    # Authentification (hors CRUD)
    path("auth/register/", register, name="register"),
    path("auth/login/", login, name="login"),
    path("auth/logout/", TokenBlacklistView.as_view(), name="token-blacklist"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    # Traduction (microservice NLLB)
    path("translation/languages/", translation_languages, name="translation-languages"),
    path("translation/translate/", translate_endpoint, name="translation-translate"),
    # Health check
    path("health/", health_check, name="health-check"),
    # Médias protégés (Point 17 Audit Sec)
    path("media/<path:path>", serve_protected_media, name="serve-media"),
]
