"""
Django settings for OrdoCare.

Toutes les valeurs sensibles sont lues depuis les variables d'environnement
(fichier .env chargé via python-dotenv). Aucun secret n'est hardcodé.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# Charger le fichier .env à la racine du projet
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv()

# ── Sécurité ─────────────────────────────────────────────────────────────────

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if ENVIRONMENT == "production":
        raise ValueError("SECRET_KEY manquante ! Définissez SECRET_KEY dans les variables d'environnement.")
    SECRET_KEY = "django-insecure-dev-only-key-do-not-use-in-production"

# Clé pour le chiffrement des champs (SSN)
FIELD_ENCRYPTION_KEY = os.getenv("FIELD_ENCRYPTION_KEY", "")
if not FIELD_ENCRYPTION_KEY and ENVIRONMENT == "production":
    raise ValueError("FIELD_ENCRYPTION_KEY manquante en production.")

_allowed_hosts_raw = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw if h.strip()]
if ENVIRONMENT == "production" and "*" in ALLOWED_HOSTS:
    raise ValueError(
        "ALLOWED_HOSTS ne doit pas contenir '*' en production. " "Listez explicitement les hôtes autorisés."
    )

# Upload constraints
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10")) * 1024 * 1024  # 10 Mo
ALLOWED_UPLOAD_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/tiff",
    "image/webp",
}

# ── Applications ─────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "core",
    "drf_yasg",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "ordocare_dj.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "ordocare_dj.wsgi.application"

# ── Base de données ──────────────────────────────────────────────────────────
# En local : SQLite par défaut (zéro config)
# En déploiement : PostgreSQL via variables d'environnement

if os.getenv("DB_ENGINE"):
    DATABASES = {
        "default": {
            "ENGINE": os.getenv("DB_ENGINE"),
            "NAME": os.getenv("DB_NAME", "ordocare"),
            "USER": os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# ── Internationalisation ─────────────────────────────────────────────────────

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

# ── Fichiers statiques et media ──────────────────────────────────────────────

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# ── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.authentication.CustomJWTAuthentication",
    ],
    # Pagination par défaut (évite de renvoyer des milliers d'objets)
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.getenv("PAGE_SIZE", "20")),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "100/hour"),
        "user": os.getenv("THROTTLE_USER", "1000/hour"),
        "login": os.getenv("THROTTLE_LOGIN", "5/minute"),
        "register": os.getenv("THROTTLE_REGISTER", "10/hour"),
    },
}

# ── JWT ──────────────────────────────────────────────────────────────────────

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("ACCESS_TOKEN_LIFETIME_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("REFRESH_TOKEN_LIFETIME_DAYS", "1"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── CORS ─────────────────────────────────────────────────────────────────────

if ENVIRONMENT == "production":
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "https://ordocare.fr").split(",")
else:
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# ── Microservice ML (TrOCR + Traduction) ────────────────────────────────────

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://127.0.0.1:8001")
ML_API_KEY = os.getenv("ML_API_KEY", "")
TRANSLATION_SERVICE_URL = os.getenv("TRANSLATION_SERVICE_URL", ML_SERVICE_URL)

# ── Logging ──────────────────────────────────────────────────────────────────

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "loggers": {
        "ordocare": {
            "handlers": ["console"],
            "level": os.getenv("LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "ordocare.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django": {
            "handlers": ["console"],
            "level": "WARNING",
        },
    },
}

# ── Sécurité HTTP (production) ──────────────────────────────────────────────

if ENVIRONMENT == "production":
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    X_FRAME_OPTIONS = "DENY"
    # HSTS Configuration
    SECURE_HSTS_SECONDS = 31536000  # 1 an
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
