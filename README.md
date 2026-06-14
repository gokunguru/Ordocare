# OrdoCare
![CI](https://img.shields.io/badge/CI-passing-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![coverage](https://img.shields.io/badge/coverage-72.5%25-green)
![Python](https://img.shields.io/badge/python-3.10+-blue)
![License](https://img.shields.io/badge/license-MIT-green)
Application mobile de numérisation d'ordonnances médicales avec OCR, traduction multilingue et gestion de rappels.

## Architecture

```
CAP-PROJET-420/
├── frontend/          # Application mobile React Native (Expo + TypeScript)
├── backend_django/    # API REST Django (DRF + JWT + Swagger)
├── ml_service/        # Microservice ML FastAPI (OCR TrOCR + Traduction NLLB-200)
├── docker-compose.yml # Orchestration Docker (dev)
└── start.sh           # Script de lancement local (sans Docker)
```

| Couche | Technologie | Port |
|--------|-------------|------|
| Frontend | React Native + Expo 54 + TypeScript | 8081 |
| Backend | Django 5 + DRF + JWT (SimpleJWT) | 8000 |
| ML Service | FastAPI + TrOCR (Microsoft) + NLLB-200 (Meta) | 8001 |
| Base de données | SQLite (dev) / PostgreSQL (prod/Docker) | 5432 |

## Fonctionnalités

- **Scan d'ordonnances** : photo, galerie ou import fichier (PDF/image)
- **Double OCR** : imprimée (Tesseract) ou manuscrite (TrOCR)
- **Extraction automatique** : médicaments, posologie, durée, fréquence
- **Traduction multilingue** : 38 langues via NLLB-200 (Meta)
- **Rappels automatiques** : notifications de prise de médicaments
- **Historique** : consultation des ordonnances passées
- **Mode sombre** : thème clair/sombre

---

## Prérequis

- **Node.js** >= 18 + npm
- **Python** >= 3.10
- **Expo CLI** : `npm install -g expo-cli`
- **Docker** (optionnel, pour le lancement conteneurisé)

---

## Lancement du projet

### 1. Frontend (application mobile)

```bash
cd frontend
npm install
npx expo start
```

Puis :
- **Téléphone** : scanner le QR code avec Expo Go
- **Web** : appuyer sur `w`
- **Android** : appuyer sur `a` (émulateur requis)
- **iOS** : appuyer sur `i` (Mac + Xcode requis)

### 2. Backend Django

```bash
cd backend_django
cp .env.example .env          # adapter les valeurs si besoin
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Accès :
- Swagger : http://localhost:8000/swagger/
- API : http://localhost:8000/api/v1/

### 3. Service ML (requis pour la traduction et l'OCR manuscrit)

```bash
cd ml_service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Health check : http://localhost:8001/health

### 4. Lancement rapide (tout en un)

```bash
chmod +x start.sh
./start.sh
```

### 5. Lancement avec Docker

```bash
cp .env.example .env          # remplir ML_API_KEY
docker compose up --build
```

---

## Configuration

### Variables d'environnement (backend)

Copier `backend_django/.env.example` en `backend_django/.env` :

| Variable | Description | Défaut |
|----------|-------------|--------|
| `SECRET_KEY` | Clé secrète Django | `change-me-...` |
| `DEBUG` | Mode debug | `True` |
| `ML_SERVICE_URL` | URL du microservice ML | `http://127.0.0.1:8001` |
| `ML_API_KEY` | Clé API du service ML | (vide) |
| `TESSERACT_CMD` | Chemin Tesseract | `/opt/homebrew/bin/tesseract` (macOS) |

### Base de données

- **Dev local** : SQLite par défaut (aucune config nécessaire)
- **Docker / Prod** : PostgreSQL (configuré automatiquement via docker-compose)

---

## Workflow Git

### Branches

| Branche | Rôle |
|---------|------|
| `main` | Production stable |
| `pre-prod` | Pré-production / staging |
| `dev` | Développement (branche principale de travail) |

### Processus de contribution

#### 1. Se placer sur dev à jour

```bash
git checkout dev
git pull origin dev
```

#### 2. Créer une branche dédiée

Ne jamais travailler directement sur `dev`.

```bash
git checkout -b feature/nom-de-la-feature
```

Exemples de noms :
- `feature/add-gallery-upload`
- `fix/swagger-jwt-auth`
- `refactor/upload-serializer`

#### 3. Développer la fonctionnalité

Faire les modifications nécessaires dans le code.

#### 4. Ajouter les fichiers modifiés

```bash
git add .
```

#### 5. Faire un commit clair et explicite

Format recommandé :

```bash
git commit -m "type(scope): description courte"
```

Exemples :
- `fix(auth): correct swagger bearer configuration`
- `feat(scan): add gallery file upload`
- `refactor(upload): remove user field from serializer`

#### 6. Pousser la branche sur le dépôt distant

```bash
git push origin feature/nom-de-la-feature
```

#### 7. Créer une Pull Request

Sur GitHub :
- **Base** : `dev`
- **Compare** : votre branche
- Créer la Pull Request
- Merge après validation

#### 8. Supprimer la branche après merge

En local :
```bash
git checkout dev
git pull origin dev
git branch -d feature/nom-de-la-feature
```

Sur le dépôt distant :
```bash
git push origin --delete feature/nom-de-la-feature
```
## CI/CD

Pipeline GitHub Actions automatisé.

### Étapes

- **Lint**
  - flake8
  - black
  - isort
  - bandit (analyse de sécurité)

- **Tests**
  - pytest
  - génération du rapport de couverture (coverage.xml)
  - vérification des migrations Django

- **Build**
  - construction automatique de l’image Docker du backend
  - push vers Docker Hub (branches dev et main)

### Objectif

Garantir :
- Qualité du code
- Sécurité minimale
- Tests validés avant merge
- Image Docker reproductible et déployable
### Règles importantes

- Ne jamais push directement sur `dev`
- Ne pas mélanger plusieurs features dans une seule branche
- **Une branche = une fonctionnalité**
- **Un commit clair et descriptif**
- Toujours passer par une **Pull Request**

---

## Stack technique

### Frontend
- React Native 0.81 + Expo 54
- TypeScript (strict mode)
- Axios avec intercepteurs JWT (refresh automatique)
- Lucide React Native (icônes)
- AsyncStorage + SecureStore

### Backend
- Django 5 + Django REST Framework
- JWT (SimpleJWT) avec rotation de tokens
- Swagger/OpenAPI (drf-spectacular)
- Architecture services : `views → services → processing`
- Permissions DRF (`IsOwner`, `IsAuthenticated`)

### ML Service
- FastAPI
- TrOCR (Microsoft) pour l'OCR manuscrit
- NLLB-200 (Meta) pour la traduction (38 langues)
- Tesseract pour l'OCR imprimé
- Thread-safe model loading

## Sécurité

- Authentification JWT (access + refresh tokens)
- Rotation des tokens via SimpleJWT
- Protection contre l’énumération d’utilisateurs (messages génériques côté service)
- Validation stricte des mots de passe (longueur + complexité)
- Permissions DRF basées sur le propriétaire des ressources
- Médias protégés (accès contrôlé via endpoint sécurisé)
- Variables sensibles gérées via variables d’environnement
- Analyse statique de sécurité via Bandit intégrée à la CI

---

## API Endpoints principaux

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/v1/auth/register/` | Inscription |
| POST | `/api/v1/auth/login/` | Connexion (JWT) |
| POST | `/api/v1/auth/token/refresh/` | Refresh token |
| POST | `/api/v1/files/upload/` | Upload ordonnance imprimée |
| POST | `/api/v1/files/upload-handwritten/` | Upload ordonnance manuscrite |
| GET | `/api/v1/users/{id}/history/` | Historique ordonnances |
| GET | `/api/v1/users/{id}/reminders/` | Rappels médicaments |
| GET | `/api/v1/translation/languages/` | Langues disponibles |
| POST | `/api/v1/translation/translate/` | Traduire un texte |

Documentation complète : http://localhost:8000/swagger/
