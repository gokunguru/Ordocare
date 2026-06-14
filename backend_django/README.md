# OrdoCare — Backend Django

API REST pour la gestion d'ordonnances médicales avec extraction OCR automatique.

## Structure du projet

```
backend_django/
├── api/                          # Couche Interface
│   ├── views/views.py            # ViewSets DRF + endpoints auth
│   ├── serializers/serializers.py # Sérialisation + schémas Swagger
│   └── urls.py                   # Routage REST (Router DRF)
├── domain/                       # Couche Domaine
│   ├── models/models.py          # Entités métier (ORM Django)
│   └── services/
│       ├── auth_service.py       # Inscription / Connexion
│       ├── upload_service.py     # Upload + OCR + extraction
│       └── reminder_service.py   # Parsing fréquence/durée + rappels
├── processing/                   # Couche Traitement
│   └── parser/
│       └── prescription_parser.py # OCR (pdfplumber/Tesseract) + regex
├── core/                         # Infrastructure Django
│   ├── models.py                 # Bridge : from domain.models import *
│   ├── authentication.py         # JWT custom (AppUser)
│   ├── admin.py                  # Interface admin Django
│   └── management/commands/      # Commandes Django custom
├── ordocare_dj/                  # Configuration
│   ├── settings.py               # Config (python-dotenv)
│   ├── urls.py                   # Routes racine + Swagger
│   └── wsgi.py
├── tests/                        # Tests pytest
│   ├── conftest.py               # Fixtures
│   ├── test_auth_service.py
│   ├── test_reminder_service.py
│   ├── test_prescription_parser.py
│   └── test_api.py
└── docs/
    └── architecture.md           # Documentation architecture complète
```

## Lancer le projet

```bash
# 1. Environnement virtuel
python -m venv venv
source venv/bin/activate

# 2. Dépendances
pip install -r requirements.txt

# 3. Configuration
cp .env.example .env

# 4. Migrations
python manage.py migrate

# 5. Serveur
python manage.py runserver
```

## URLs

| URL | Description |
|-----|-------------|
| `/swagger/` | Documentation Swagger UI |
| `/redoc/` | Documentation ReDoc |
| `/api/v1/` | API REST |

## Tests

```bash
python -m pytest tests/ -v
```

## Docker

```bash
# Développement
docker-compose up --build

# Production
docker-compose -f docker-compose.prod.yml up --build
```

## Conventions

- **Logique métier** dans `domain/services/`, jamais dans les vues
- **Dépendances unidirectionnelles** : `api/ → domain/ → processing/`
- **Nommage** : PascalCase (classes), snake_case (fonctions/fichiers)
- Voir `docs/architecture.md` pour la documentation complète
