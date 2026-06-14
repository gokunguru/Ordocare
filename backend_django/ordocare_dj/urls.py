"""
Configuration des URLs racine — OrdoCare

Versioning API : toutes les routes API sont préfixées par /api/v1/
(convention REST, cf. cours Architecture — permet l'évolution sans casser les clients).

Documentation interactive :
    /swagger/   → Swagger UI (test interactif des endpoints)
    /redoc/     → ReDoc (documentation lisible)
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from drf_yasg import openapi
from drf_yasg.views import get_schema_view
from rest_framework import permissions

# ── Configuration Swagger / OpenAPI ──────────────────────────────────────────

schema_view = get_schema_view(
    openapi.Info(
        title="OrdoCare API",
        default_version="v1",
        description=(
            "API REST du projet OrdoCare — gestion d'ordonnances médicales.\n\n"
            "## Fonctionnalités\n"
            "- **Authentification** : inscription et connexion avec tokens JWT\n"
            "- **Upload d'ordonnances** : extraction OCR automatique "
            "(PDF via pdfplumber, images via Tesseract)\n"
            "- **OCR manuscrit** : reconnaissance d'écriture manuscrite via TrOCR\n"
            "- **Prescriptions** : parsing automatique des médicaments, "
            "dosages, fréquences et durées\n"
            "- **Rappels** : génération automatique des rappels de prise "
            "de médicaments selon la fréquence et la durée\n"
            "- **Traduction** : traduction de prescriptions via NLLB-200\n"
            "- **Profil médical** : informations de santé de l'utilisateur\n\n"
            "## Architecture\n"
            "Django app standard avec service layer :\n"
            "- `core/` — App Django (models, views, serializers, urls)\n"
            "- `core/services/` — Logique métier (auth, upload, reminders)\n"
            "- `core/processing/` — Traitements techniques (OCR, regex)\n"
            "- `ml_service/` — Microservice FastAPI (TrOCR, NLLB)\n\n"
            "## Versioning\n"
            "Toutes les routes sont préfixées par `/api/v1/`.\n\n"
            "## Authentification\n"
            "JWT Bearer token via header `Authorization: Bearer <access_token>`"
        ),
        contact=openapi.Contact(email="contact@ordocare.fr"),
        license=openapi.License(name="MIT"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

# ── Routes ───────────────────────────────────────────────────────────────────
urlpatterns = [
    path("admin/", admin.site.urls),
    # API versionnée (v1)
    path("api/v1/", include("core.urls")),
]

# Documentation Swagger / ReDoc (accessible aussi en CI)
urlpatterns += [
    re_path(
        r"^swagger(?P<format>\.json|\.yaml)$",
        schema_view.without_ui(cache_timeout=0),
        name="schema-json",
    ),
    path(
        "swagger/",
        schema_view.with_ui("swagger", cache_timeout=0),
        name="schema-swagger-ui",
    ),
    path(
        "redoc/",
        schema_view.with_ui("redoc", cache_timeout=0),
        name="schema-redoc",
    ),
]

# Servir les fichiers media en développement
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
