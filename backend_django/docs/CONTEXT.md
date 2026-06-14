# OrdoCare — Fichier Contexte (Guide de développement)

> Ce fichier explique l'architecture du projet de manière précise pour permettre à tout développeur
> (humain ou IA) de comprendre où ajouter du code et comment le faire correctement.

---

## 1. Présentation du projet

### 1.1 Qu'est-ce qu'OrdoCare ?

OrdoCare est une application mobile de gestion d'ordonnances médicales. Elle permet aux patients de :
- Scanner une ordonnance (photo ou PDF)
- Extraire automatiquement les médicaments via OCR
- Recevoir des rappels de prise de médicaments
- Consulter leur historique médical

### 1.2 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Python 3.10, Django 5.1, Django REST Framework 3.15 |
| Frontend | React Native (Expo) |
| Base de données | SQLite (dev) / PostgreSQL (prod) |
| Authentification | JWT via SimpleJWT |
| OCR | pdfplumber (PDF) + pytesseract (images) |
| Documentation API | Swagger/OpenAPI via drf-yasg |
| Tests | pytest + pytest-django |

---

## 2. Architecture du backend

### 2.1 Style architectural

Le backend suit une **architecture Django App avec Service Layer** :
- Une seule app Django : `core/`
- Logique métier isolée dans `core/services/`
- Traitements techniques dans `core/processing/`
- Vues = orchestration uniquement (pas de logique métier)

### 2.2 Structure des dossiers

```
backend_django/
├── manage.py                     # Point d'entrée Django
├── ordocare_dj/                  # Configuration Django
│   ├── __init__.py
│   ├── settings.py               # Configuration (DB, JWT, apps)
│   ├── urls.py                   # Routes racine + Swagger
│   ├── asgi.py
│   └── wsgi.py
│
├── core/                         # APP DJANGO PRINCIPALE
│   ├── __init__.py
│   ├── apps.py                   # Configuration de l'app
│   ├── models.py                 # 6 modèles (AppUser, File, Prescription, etc.)
│   ├── views.py                  # ViewSets DRF + endpoints auth
│   ├── serializers.py            # Sérialisation JSON <-> modèles
│   ├── urls.py                   # Routage REST (Router DRF)
│   ├── admin.py                  # Interface admin Django
│   ├── authentication.py         # Backend JWT custom
│   │
│   ├── services/                 # LOGIQUE MÉTIER
│   │   ├── __init__.py
│   │   ├── auth_service.py       # register_user(), login_user()
│   │   ├── upload_service.py     # process_file_upload()
│   │   └── reminder_service.py   # parse_frequency(), create_auto_reminders()
│   │
│   ├── processing/               # TRAITEMENTS TECHNIQUES
│   │   ├── __init__.py
│   │   └── prescription_parser.py # OCR + extraction regex
│   │
│   ├── management/commands/      # Commandes Django custom
│   │   └── delete_expired_prescriptions.py
│   │
│   ├── migrations/               # Migrations base de données
│   │
│   └── tests/                    # TESTS PYTEST (53 tests)
│       ├── __init__.py
│       ├── conftest.py           # Fixtures partagées (user, file, prescription)
│       ├── test_api.py           # Tests endpoints REST
│       ├── test_auth_service.py  # Tests auth_service
│       ├── test_reminder_service.py
│       └── test_prescription_parser.py
│
├── docs/                         # Documentation
│   ├── architecture.md           # Architecture détaillée (Mermaid)
│   └── CONTEXT.md                # CE FICHIER
│
├── media/uploads/                # Fichiers uploadés (ignoré par git)
├── requirements.txt              # Dépendances Python
├── pytest.ini                    # Configuration pytest
├── .env.example                  # Template variables d'environnement
├── Dockerfile
└── docker-compose.yml
```

### 2.3 Règle des dépendances

```
core/views.py  ──►  core/services/*  ──►  core/models.py
                                     ──►  core/processing/*
```

| Couche | Peut importer | Ne peut PAS importer |
|--------|---------------|----------------------|
| `views.py` | services, serializers, models | processing |
| `services/` | models, processing | views, serializers |
| `processing/` | libs externes (pdfplumber, tesseract) | models, services, views |
| `models.py` | Django, Python standard | rien du projet |

**Règle absolue** : La logique métier va dans `services/`, JAMAIS dans `views.py`.

---

## 3. Les 6 modèles de données

Tous définis dans `core/models.py` avec `app_label = "core"`.

### 3.1 AppUser (utilisateur)
```python
class AppUser(AbstractBaseUser, PermissionsMixin):
    username = CharField(max_length=150, unique=True)
    email = EmailField(unique=True)
    first_name = CharField(max_length=30)
    last_name = CharField(max_length=30)
    phone_number = CharField(max_length=20, blank=True)
    address = TextField(blank=True)
    date_joined = DateTimeField(auto_now_add=True)
    is_active = BooleanField(default=True)
    is_staff = BooleanField(default=False)
```

### 3.2 File (fichier uploadé)
```python
class File(Model):
    user = ForeignKey(AppUser, on_delete=CASCADE)
    file = FileField(upload_to="uploads/")
    uploaded_at = DateTimeField(auto_now_add=True)
    file_type = CharField(max_length=50)  # "pdf", "image"
    raw_text = TextField(blank=True)       # Texte OCR extrait
```

### 3.3 Prescription (médicament extrait)
```python
class Prescription(Model):
    file = ForeignKey(File, on_delete=CASCADE)
    medicament = CharField(max_length=255)
    dosage = CharField(max_length=100, blank=True)
    frequence = CharField(max_length=100, blank=True)  # "3 fois par jour"
    duree = CharField(max_length=100, blank=True)      # "7 jours"
    conditions = TextField(blank=True)                 # "pendant les repas"
    created_at = DateTimeField(auto_now_add=True)
```

### 3.4 Reminder (rappel)
```python
class Reminder(Model):
    prescription = ForeignKey(Prescription, on_delete=CASCADE)
    reminder_time = DateTimeField()
    status = CharField(choices=["pending", "taken", "skipped"])
    notified = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
```

### 3.5 MedicalProfile (profil médical)
```python
class MedicalProfile(Model):
    user = OneToOneField(AppUser, on_delete=CASCADE)
    allergies = TextField(blank=True)
    medical_history = TextField(blank=True)
    emergency_contact_name = CharField(max_length=100, blank=True)
    emergency_contact_phone = CharField(max_length=20, blank=True)
```

### 3.6 Translation (traduction — évolution future)
```python
class Translation(Model):
    file = ForeignKey(File, on_delete=CASCADE)
    source_lang = CharField(max_length=10)
    target_lang = CharField(max_length=10)
    original_text = TextField()
    translated_text = TextField()
```

### 3.7 Relations entre modèles

```
AppUser ──1:N──► File ──1:N──► Prescription ──1:N──► Reminder
    │                    │
    │                    └──1:N──► Translation
    │
    └──1:1──► MedicalProfile
```

---

## 4. Les 3 services métier

### 4.1 auth_service.py

**Fichier** : `core/services/auth_service.py`

| Fonction | Entrée | Sortie | Description |
|----------|--------|--------|-------------|
| `register_user(data)` | dict avec username, email, password, etc. | `AppUser` | Crée un utilisateur + MedicalProfile vide |
| `login_user(username, password)` | credentials | `{access, refresh}` ou erreur | Vérifie credentials, retourne tokens JWT |

**Utilisé par** : `views.py` (endpoints `/auth/register/` et `/auth/login/`)

### 4.2 upload_service.py

**Fichier** : `core/services/upload_service.py`

| Fonction | Entrée | Sortie | Description |
|----------|--------|--------|-------------|
| `process_file_upload(user_id, file)` | ID user + fichier | `{file, prescriptions, reminders_count}` | Pipeline complet : save → OCR → parse → reminders |

**Pipeline interne** :
1. Créer `File` en base
2. Appeler `extract_text_from_pdf()` ou `extract_text_from_image()`
3. Appeler `extract_all_prescriptions(text)`
4. Créer `Prescription` pour chaque médicament trouvé
5. Appeler `create_auto_reminders()` pour chaque prescription
6. Retourner résumé

**Utilisé par** : `views.py` (endpoint `POST /files/upload/`)

### 4.3 reminder_service.py

**Fichier** : `core/services/reminder_service.py`

| Fonction | Entrée | Sortie | Description |
|----------|--------|--------|-------------|
| `parse_frequency(text)` | "3 fois par jour" | `3` | Extrait le nombre de prises/jour |
| `parse_duration(text)` | "7 jours" | `7` | Extrait la durée en jours |
| `create_auto_reminders(prescription, times_per_day, num_days)` | prescription + params | `[Reminder]` | Crée les rappels automatiques |

**Utilisé par** : `upload_service.py`

---

## 5. Le module processing

### 5.1 prescription_parser.py

**Fichier** : `core/processing/prescription_parser.py`

| Fonction | Entrée | Sortie | Description |
|----------|--------|--------|-------------|
| `extract_text_from_pdf(file_path)` | chemin PDF | texte brut | OCR via pdfplumber |
| `extract_text_from_image(file_path)` | chemin image | texte brut | OCR via pytesseract + OpenCV |
| `extract_prescription(line)` | ligne de texte | `{medicament, dosage, ...}` ou None | Parse une ligne |
| `extract_all_prescriptions(text)` | texte complet | `[{medicament, ...}]` | Parse tout le texte |

**Regex utilisées** :
- Médicament : `^([A-Za-zÀ-ÿ\-]+)`
- Dosage : `(\d+\s*(mg|g|ml|comprimé|gélule))`
- Fréquence : `(\d+\s*(fois|/)\s*(par)?\s*(jour|j))`
- Durée : `(pendant\s*)?\d+\s*(jour|semaine|mois)`

---

## 6. API REST — Endpoints

### 6.1 Authentification (non protégés)

| Méthode | Endpoint | Body | Réponse |
|---------|----------|------|---------|
| POST | `/api/v1/auth/register/` | `{username, email, password, first_name, last_name}` | 201 + user |
| POST | `/api/v1/auth/login/` | `{username, password}` | 200 + `{access, refresh}` |

### 6.2 Ressources protégées (JWT requis)

Header : `Authorization: Bearer <access_token>`

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/v1/users/` | Liste utilisateurs |
| GET | `/api/v1/users/{id}/` | Détail utilisateur |
| GET | `/api/v1/users/{id}/files/` | Fichiers de l'utilisateur |
| GET | `/api/v1/users/{id}/prescriptions/` | Prescriptions de l'utilisateur |
| GET | `/api/v1/users/{id}/reminders/` | Rappels de l'utilisateur |
| GET/PUT/PATCH | `/api/v1/users/{id}/medical-profile/` | Profil médical |
| POST | `/api/v1/files/upload/` | Upload ordonnance + OCR |
| GET | `/api/v1/files/{id}/download/` | Télécharger fichier |
| GET/POST | `/api/v1/reminders/` | Liste/Créer rappels |
| PATCH/DELETE | `/api/v1/reminders/{id}/` | Modifier/Supprimer rappel |

---

## 7. Comment ajouter une fonctionnalité

### 7.1 Ajouter un nouveau modèle

1. **Définir le modèle** dans `core/models.py` :
```python
class NouveauModele(models.Model):
    champ = models.CharField(max_length=100)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "core"
```

2. **Créer la migration** :
```bash
python manage.py makemigrations core
python manage.py migrate
```

3. **Ajouter le serializer** dans `core/serializers.py` :
```python
class NouveauModeleSerializer(serializers.ModelSerializer):
    class Meta:
        model = NouveauModele
        fields = "__all__"
```

4. **Ajouter le ViewSet** dans `core/views.py` :
```python
class NouveauModeleViewSet(viewsets.ModelViewSet):
    queryset = NouveauModele.objects.all()
    serializer_class = NouveauModeleSerializer
    permission_classes = [IsAuthenticated]
```

5. **Enregistrer la route** dans `core/urls.py` :
```python
router.register(r"nouveau-modele", NouveauModeleViewSet)
```

6. **Ajouter à l'admin** dans `core/admin.py` :
```python
@admin.register(NouveauModele)
class NouveauModeleAdmin(admin.ModelAdmin):
    list_display = ("id", "champ", "user", "created_at")
```

### 7.2 Ajouter une logique métier

1. **Créer ou modifier un service** dans `core/services/` :
```python
# core/services/nouveau_service.py
from core.models import NouveauModele

def ma_logique_metier(param1, param2):
    """
    Description de ce que fait la fonction.

    Args:
        param1: Description
        param2: Description

    Returns:
        Description du retour

    Raises:
        ValueError: Si param invalide
    """
    # Logique ici
    return resultat
```

2. **Appeler depuis la vue** :
```python
# core/views.py
from core.services.nouveau_service import ma_logique_metier

class MonViewSet(viewsets.ModelViewSet):
    @action(detail=False, methods=["post"])
    def mon_action(self, request):
        result = ma_logique_metier(request.data["param1"], request.data["param2"])
        return Response(result, status=status.HTTP_200_OK)
```

### 7.3 Ajouter un traitement technique (OCR/ML)

1. **Ajouter le fichier** dans `core/processing/` :
```python
# core/processing/nouveau_parser.py

def nouveau_traitement(input_data):
    """
    Traitement technique isolé.
    Ne dépend PAS de core.models ni core.services.
    """
    # Traitement avec libs externes
    return resultat
```

2. **Appeler depuis un service** :
```python
# core/services/upload_service.py
from core.processing.nouveau_parser import nouveau_traitement

def process_avec_nouveau_traitement(data):
    result = nouveau_traitement(data)
    # Créer des objets en base avec result
```

### 7.4 Ajouter un endpoint custom

1. **Dans le ViewSet existant** (action) :
```python
class UserViewSet(viewsets.ModelViewSet):
    @action(detail=True, methods=["get"], url_path="ma-ressource")
    def ma_ressource(self, request, pk=None):
        user = self.get_object()
        # Logique
        return Response(data)
```
→ Génère : `GET /api/v1/users/{id}/ma-ressource/`

2. **Endpoint séparé** (function-based view) :
```python
# core/views.py
from rest_framework.decorators import api_view, permission_classes

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mon_endpoint(request):
    # Logique
    return Response(data)

# core/urls.py
urlpatterns = [
    path("mon-endpoint/", views.mon_endpoint, name="mon-endpoint"),
]
```

### 7.5 Ajouter des tests

1. **Créer le fichier de test** dans `core/tests/` :
```python
# core/tests/test_nouveau_service.py
import pytest
from core.services.nouveau_service import ma_fonction

class TestMaFonction:
    def test_cas_nominal(self):
        result = ma_fonction("input")
        assert result == "expected"

    def test_cas_erreur(self):
        with pytest.raises(ValueError):
            ma_fonction(None)

@pytest.mark.django_db
class TestAvecDB:
    def test_avec_fixtures(self, user):  # user vient de conftest.py
        # Test avec accès DB
        pass
```

2. **Lancer les tests** :
```bash
python -m pytest core/tests/ -v
python -m pytest core/tests/test_nouveau_service.py -v  # Un fichier
python -m pytest core/tests/ -k "test_cas_nominal"      # Un test
```

---

## 8. Conventions de code

### 8.1 Nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Fichiers Python | `snake_case.py` | `upload_service.py` |
| Classes | `PascalCase` | `AppUserViewSet` |
| Fonctions | `snake_case` | `process_file_upload` |
| Constantes | `UPPER_SNAKE` | `ACCESS_TOKEN_LIFETIME` |
| Variables | `snake_case` | `user_id` |
| URLs | `kebab-case` | `/medical-profile/` |

### 8.2 Imports

Ordre des imports (séparés par une ligne vide) :
1. Standard library (os, re, datetime)
2. Third-party (django, rest_framework)
3. Local (core.models, core.services)

```python
import re
from datetime import datetime

from django.db import models
from rest_framework import viewsets

from core.models import AppUser
from core.services.auth_service import register_user
```

### 8.3 Docstrings

```python
def ma_fonction(param1: str, param2: int) -> dict:
    """
    Description courte de la fonction.

    Args:
        param1: Description du param1
        param2: Description du param2

    Returns:
        dict contenant {key: value}

    Raises:
        ValueError: Si param1 est vide
    """
```

### 8.4 Gestion des erreurs

- **Services** : lever des exceptions Python (`ValueError`, `PermissionError`)
- **Vues** : attraper et convertir en réponses HTTP

```python
# Service
def login_user(username, password):
    user = AppUser.objects.filter(username=username).first()
    if not user:
        raise ValueError("Identifiants invalides")
    return generate_tokens(user)

# Vue
@api_view(["POST"])
def login(request):
    try:
        tokens = login_user(request.data["username"], request.data["password"])
        return Response(tokens, status=200)
    except ValueError as e:
        return Response({"error": str(e)}, status=401)
```

---

## 9. Commandes utiles

```bash
# Serveur de développement
python manage.py runserver

# Migrations
python manage.py makemigrations core
python manage.py migrate

# Tests
python -m pytest core/tests/ -v
python -m pytest core/tests/ -v --cov=core  # Avec couverture

# Shell Django
python manage.py shell

# Créer superuser
python manage.py createsuperuser

# Vérifications
python manage.py check
python manage.py makemigrations --check --dry-run
```

---

## 10. Variables d'environnement

Fichier `.env` (copier `.env.example`) :

```env
# Base de données (laisser vide pour SQLite)
DB_ENGINE=django.db.backends.postgresql
DB_NAME=ordocare
DB_USER=postgres
DB_PASSWORD=secret
DB_HOST=localhost
DB_PORT=5432

# Django
SECRET_KEY=change-me-in-production
DEBUG=True
```

---

## 11. Checklist avant commit

- [ ] `python manage.py check` → pas d'erreurs
- [ ] `python -m pytest core/tests/ -v` → tous les tests passent
- [ ] Pas de `print()` dans le code (utiliser `logging`)
- [ ] Logique métier dans `services/`, pas dans `views.py`
- [ ] Nouveau modèle ? → Migration créée et appliquée
- [ ] Nouveau endpoint ? → Documenté dans Swagger (serializer)
- [ ] Tests ajoutés pour la nouvelle fonctionnalité

---

*Dernière mise à jour : Février 2026*
