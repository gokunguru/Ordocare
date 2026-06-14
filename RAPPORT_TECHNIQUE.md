# Rapport Technique — OrdoCare

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Architecture globale](#2-architecture-globale)
3. [Backend Django](#3-backend-django)
4. [Frontend React Native](#4-frontend-react-native)
5. [ML Service FastAPI](#5-ml-service-fastapi)
6. [Infrastructure Docker](#6-infrastructure-docker)
7. [Flux de données (Data Flows)](#7-flux-de-données)
8. [Sécurité](#8-sécurité)
9. [Refactoring qualité — Changelog complet](#9-refactoring-qualité--changelog-complet)
10. [Questions techniques probables](#10-questions-techniques-probables)

---

## 1. Présentation du projet

**OrdoCare** est une application mobile de santé qui permet aux utilisateurs de :

- **Scanner des ordonnances** (imprimées ou manuscrites) via OCR
- **Extraire automatiquement les médicaments** (nom, posologie, fréquence, durée)
- **Créer des rappels de prise** avec notifications push
- **Traduire les ordonnances** dans 200+ langues via NLLB-200
- **Gérer un profil médical** (allergies, antécédents, médecin traitant)

### Stack technique

| Couche | Technologie | Version |
|--------|------------|---------|
| Frontend | React Native (Expo) | React 19, Expo 54 |
| Backend API | Django + Django REST Framework | Django 5.1.2, DRF 3.15.2 |
| ML Service | FastAPI + PyTorch + Transformers | FastAPI 0.115, Torch 2.6 |
| Base de données | PostgreSQL (prod) / SQLite (dev) | — |
| Conteneurisation | Docker + Docker Compose | Multi-stage builds |
| Auth | JWT (SimpleJWT) | Access 5min, Refresh 1j |

---

## 2. Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEUR                              │
│                   (iOS / Android / Web)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND — React Native (Expo)                 │
│                                                                 │
│  Screens: Scan, History, Reminders, Translations, Account, ...  │
│  Services: api.js (Axios + JWT), auth.js, notifications.js      │
│  Context: ThemeContext (dark/light mode)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP REST (JSON)
                           │  Authorization: Bearer <JWT>
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND — Django REST Framework                │
│                        Port 8000                                │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Views    │  │  Serializers │  │  Permissions (IsOwner) │    │
│  │ (ViewSets)│  │  (validation)│  │  (protection IDOR)     │    │
│  └────┬─────┘  └──────────────┘  └────────────────────────┘    │
│       │                                                         │
│  ┌────▼──────────────────────────────────────┐                  │
│  │           Services (couche métier)         │                  │
│  │  auth_service, upload_service,             │                  │
│  │  reminder_service, translation_service,    │                  │
│  │  upload_handwritten_service                │                  │
│  └────┬──────────────────────────────────────┘                  │
│       │                                                         │
│  ┌────▼──────────────────────────────────────┐                  │
│  │        Processing (extraction texte)       │                  │
│  │  prescription_parser (regex),              │                  │
│  │  abbrev_expander, Tesseract OCR,           │                  │
│  │  pdfplumber                                │                  │
│  └────┬──────────────────────────────────────┘                  │
│       │                                                         │
│  ┌────▼──────┐                                                  │
│  │  Models   │  AppUser, File, Prescription, Reminder,          │
│  │  (ORM)    │  Translation, MedicalProfile                     │
│  └────┬──────┘                                                  │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │ Database │  PostgreSQL (prod) / SQLite (dev)                 │
│  └──────────┘                                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP interne (réseau Docker)
                           │  X-API-Key: <HMAC>
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               ML SERVICE — FastAPI + PyTorch                    │
│                        Port 8001                                │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────┐       │
│  │     Module OCR      │    │   Module Translation     │       │
│  │  (TrOCR manuscrit)  │    │   (NLLB-200, 200 langues)│       │
│  │                     │    │                          │       │
│  │  router.py          │    │  router.py               │       │
│  │  service.py         │    │  service.py              │       │
│  │  model_loader.py    │    │  model_loader.py         │       │
│  │  schemas.py         │    │  schemas.py              │       │
│  └─────────────────────┘    └──────────────────────────┘       │
│                                                                 │
│  Shared: utils.py (get_device), dependencies.py (API key)       │
└─────────────────────────────────────────────────────────────────┘
```

### Pourquoi cette architecture ?

- **Microservices** : Le ML Service est séparé car les modèles PyTorch consomment beaucoup de RAM (~4 Go). L'isoler permet de le scaler indépendamment et d'éviter que le backend Django ne soit ralenti.
- **Service Layer** : La logique métier est dans `core/services/`, pas dans les vues. Les vues ne font que valider les entrées et appeler les services.
- **Réseau interne Docker** : Le ML Service n'est pas exposé à l'extérieur, uniquement le backend y accède via le réseau Docker `internal`.

---

## 3. Backend Django

### 3.1 Structure des fichiers

```
backend_django/
├── ordocare_dj/
│   ├── settings.py         # Config (DB, JWT, CORS, throttling, ML_SERVICE_URL)
│   └── urls.py             # Routeur racine → /api/v1/
│
├── core/
│   ├── models.py           # 6 modèles (AppUser, File, Prescription, Reminder, Translation, MedicalProfile)
│   ├── views.py            # ViewSets DRF + endpoints auth/translation
│   ├── urls.py             # Routes REST versionnées /api/v1/
│   ├── serializers.py      # Sérialisation JSON + validation entrées
│   ├── permissions.py      # IsOwner — protection IDOR
│   ├── utils.py            # build_medicine_summary()
│   ├── authentication.py   # Auth JWT custom
│   │
│   ├── services/           # Couche métier
│   │   ├── auth_service.py
│   │   ├── upload_service.py
│   │   ├── upload_handwritten_service.py
│   │   ├── reminder_service.py
│   │   ├── prescription_processing_service.py
│   │   └── translation/
│   │       ├── translation_service.py
│   │       └── language_catalog.py
│   │
│   ├── processing/         # Extraction texte
│   │   ├── prescription_parser.py    # Regex médicales
│   │   ├── abbrev_expander.py        # Expansion abréviations
│   │   └── translation_adapter.py    # Wrapper ML service
│   │
│   └── tests/              # 53 tests pytest
│       ├── test_auth_service.py
│       ├── test_api.py
│       ├── test_prescription_parser.py
│       └── test_reminder_service.py
```

### 3.2 Modèles de données (ORM)

```
AppUser (pk: id)
│   username (unique), email (unique), password (hashé), is_active
│
├── File (fk: user_id)
│   │   file (FileField), filename, uploaded_at
│   │
│   ├── Prescription (fk: file_id)
│   │   │   medicine_name, dosage_med, quantite, frequency,
│   │   │   duration, start_date, expiry_date, condition_si, description
│   │   │
│   │   └── Reminder (fk: prescription_id)
│   │       reminder_time, status (pending/taken/skipped),
│   │       notified, photo, created_at
│   │
│   └── Translation (fk: file_id)
│       original_text, translated_text, language_from, language_to
│
└── MedicalProfile (1:1 → user)
    full_name, birth_date, gender, blood_type, height, weight,
    allergies, chronic_conditions, surgeries, emergency_contact, ...
```

### 3.3 Endpoints REST

| Route | Méthode | Description | Auth |
|-------|---------|-------------|------|
| `/api/v1/auth/register/` | POST | Inscription utilisateur | Non |
| `/api/v1/auth/login/` | POST | Connexion (retourne JWT) | Non |
| `/api/v1/auth/token/refresh/` | POST | Renouveler access token | Non |
| `/api/v1/users/{id}/files/` | GET | Fichiers de l'utilisateur | JWT + IsOwner |
| `/api/v1/users/{id}/prescriptions/` | GET | Prescriptions extraites | JWT + IsOwner |
| `/api/v1/users/{id}/history/` | GET | Historique complet (fichiers + prescriptions) | JWT + IsOwner |
| `/api/v1/users/{id}/reminders/` | GET | Rappels groupés par ordonnance | JWT + IsOwner |
| `/api/v1/users/{id}/translations/` | GET | Traductions groupées | JWT + IsOwner |
| `/api/v1/users/{id}/medical-profile/` | GET/PUT/PATCH | Profil médical | JWT + IsOwner |
| `/api/v1/users/{id}/change-password/` | POST | Changement mot de passe | JWT + IsOwner |
| `/api/v1/files/upload/` | POST | Upload ordonnance imprimée (OCR Tesseract) | JWT |
| `/api/v1/files/upload-handwritten/` | POST | Upload ordonnance manuscrite (TrOCR) | JWT |
| `/api/v1/files/{id}/download/` | GET | Télécharger un fichier | JWT |
| `/api/v1/reminders/` | GET/POST | Lister / créer rappels | JWT |
| `/api/v1/reminders/{id}/` | PATCH/DELETE | Modifier / supprimer rappel | JWT |
| `/api/v1/translation/languages/` | GET | Langues disponibles | JWT |
| `/api/v1/translation/translate/` | POST | Traduire un texte | JWT |
| `/api/v1/health/` | GET | Health check Docker | Non |

### 3.4 Couche Services — Logique métier

#### `upload_service.py` — Orchestration OCR imprimé

```python
def process_file_upload(user_id, file_obj):
    # 1. Créer l'entrée File en BDD
    # 2. Détecter le type (PDF vs Image) via magic bytes
    # 3. Extraire le texte :
    #    - PDF → pdfplumber
    #    - Image → Tesseract OCR
    # 4. Parser les prescriptions via regex
    # 5. Pour chaque prescription :
    #    - Créer l'entrée Prescription en BDD
    #    - Calculer les rappels (fréquence × durée)
    #    - Créer les entrées Reminder en BDD
    # 6. Retourner : file_id, texte brut, prescriptions[], nb_rappels
```

#### `upload_handwritten_service.py` — Orchestration OCR manuscrit

```python
def process_handwritten_upload(user_id, file_obj):
    # 1. Sauvegarder le fichier
    # 2. Appel HTTP au ML Service (TrOCR)
    #    POST http://ml_service:8001/predict-handwritten
    # 3. Parser les prescriptions depuis le texte reconnu
    # 4. Créer les rappels automatiques
    # 5. Retourner la réponse enrichie
```

#### `reminder_service.py` — Parsing fréquence/durée

```python
parse_frequency("3 fois par jour")  → 3
parse_frequency("matin et soir")    → 2
parse_duration("7 jours")           → 7
parse_duration("2 semaines")        → 14
parse_duration("1 mois")            → 30

# Créneaux horaires automatiques :
# 1×/jour → 08:00
# 2×/jour → 08:00, 20:00
# 3×/jour → 08:00, 14:00, 20:00
```

#### `prescription_parser.py` — Extraction regex

Patterns regex pour texte médical français :
- `DOSAGE_MED` : "500 mg", "1 g", "10 ml"
- `QUANTITE` : "2 comprimés", "1 gélule"
- `FREQUENCES` : "3/j", "3 fois par jour", "matin et soir"
- `DUREE` : "pendant 7 jours", "2 semaines", "1 mois"
- `CONDITIONS` : "si douleur", "en cas de fièvre"

### 3.5 Permissions DRF — Protection IDOR

```python
# core/permissions.py
class IsOwner(BasePermission):
    """Empêche un utilisateur d'accéder aux données d'un autre."""
    message = "Accès interdit : vous ne pouvez consulter que vos propres données"

    def has_permission(self, request, view):
        pk = view.kwargs.get("pk")
        if pk is None:
            return False
        return request.user.is_authenticated and request.user.id == int(pk)
```

**Utilisation** : chaque action qui accède aux données personnelles a `permission_classes = [IsAuthenticated, IsOwner]`.

Sans cette permission, un utilisateur connecté pourrait modifier l'ID dans l'URL (`/users/42/reminders/` → `/users/43/reminders/`) et voir les données d'un autre utilisateur. C'est une faille **IDOR** (Insecure Direct Object Reference), classée dans le Top 10 OWASP.

### 3.6 Serializers — Validation des données

```python
# Champs explicites (pas de fields = "__all__")
class PrescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = [
            "id", "file", "medicine_name", "description",
            "dosage_med", "quantite", "frequency", "duration",
            "start_date", "expiry_date", "condition_si",
            "condition", "created_at",
        ]

# Validation stricte des entrées
class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=30)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8)
    # + validation : doit contenir lettres ET chiffres
```

**Pourquoi pas `fields = "__all__"` ?**
- Risque d'exposer des champs sensibles ajoutés ultérieurement
- Pas de contrôle explicite sur ce qui est sérialisé
- Mauvaise pratique dans les guidelines DRF officielles

---

## 4. Frontend React Native

### 4.1 Structure des fichiers

```
src/
├── screens/
│   ├── WelcomeScreen.js         # Écran d'accueil
│   ├── LoginScreen.js           # Connexion
│   ├── RegisterScreen.js        # Inscription
│   ├── OnboardingScreen.js      # Configuration initiale
│   ├── LoadingScreen.js         # Splash screen
│   ├── ScanScreen.js            # Scanner / upload ordonnances
│   ├── HistoryScreen.js         # Historique des ordonnances
│   ├── RemindersScreen.js       # Rappels de médicaments
│   ├── TranslationsScreen.js    # Historique des traductions
│   ├── AccountScreen.js         # Profil + paramètres compte
│   ├── SettingsScreen.js        # Préférences application
│   └── MedicalProfileScreen.js  # Profil médical
│
├── components/
│   ├── TabBar.js                # Barre de navigation (6 onglets)
│   ├── Button.js                # Bouton d'action
│   ├── MenuItem.js              # Item de menu (settings)
│   ├── ToggleItem.js            # Toggle on/off
│   └── EmptyState.js            # État vide réutilisable
│
├── services/
│   ├── api.js                   # Client HTTP Axios + intercepteurs JWT
│   ├── auth.js                  # register, login, logout, getUserId
│   ├── notifications.js         # Notifications push Expo
│   └── secureStorage.js         # Stockage sécurisé (tokens, credentials)
│
├── context/
│   └── ThemeContext.jsx          # Provider dark/light mode
│
└── utils/
    ├── icons.js                 # Export icônes Lucide
    ├── icons.web.js             # Icônes version web
    ├── alert.js                 # showAlert() cross-platform
    └── date.js                  # formatDate(), formatTime(), formatShortDate()
```

### 4.2 Navigation

```
App.js
│
├── Non authentifié :
│   ├── WelcomeScreen
│   ├── LoginScreen
│   └── RegisterScreen
│
├── Onboarding (première connexion) :
│   └── OnboardingScreen → MedicalProfileScreen
│
└── Authentifié (TabBar avec 6 onglets) :
    ├── 📷 Scan          → ScanScreen
    ├── 📋 Historique    → HistoryScreen
    ├── 🔔 Rappels       → RemindersScreen
    ├── 🌐 Traductions   → TranslationsScreen
    ├── 👤 Compte        → AccountScreen
    └── ⚙️ Paramètres    → SettingsScreen
```

### 4.3 Client API (`api.js`)

```javascript
const api = axios.create({
  baseURL: API_URL,        // http://localhost:8000/api/v1
  timeout: 60000,
});

// Intercepteur requête : ajoute le JWT automatiquement
api.interceptors.request.use(async (config) => {
  const token = await getSecureItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Intercepteur réponse :
// 1. Normalise les réponses paginées DRF { results: [...] } → [...]
// 2. Gère l'expiration du token (401) avec refresh automatique
// 3. File d'attente des requêtes pendant le refresh
// 4. Déconnexion auto si le refresh token est invalide
```

**Pourquoi un intercepteur de normalisation ?**
DRF retourne `{ count, next, previous, results: [...] }` pour les listes paginées. Sans l'intercepteur, chaque écran devait faire `response.data.results || response.data`. Maintenant, c'est centralisé : l'intercepteur extrait `results` automatiquement.

### 4.4 Gestion de l'authentification

```
                    ┌──────────────┐
                    │  SecureStore  │
                    │  (chiffré)   │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   access_token      refresh_token        user_id
   (expire 5min)     (expire 1 jour)      (persist)
        │                  │
        ▼                  ▼
   Intercepteur       Si 401 reçu :
   request.use()      → POST /auth/token/refresh/
   ajoute Bearer      → Nouveau access_token
                      → Rejoue les requêtes en attente
                      → Si refresh échoue → logout
```

### 4.5 Thème (Dark/Light Mode)

Le `ThemeContext` fournit :
- Couleurs : `primary`, `secondary`, `background`, `card`, `text`, `textSecondary`, `border`, `accent`, `error`, `success`
- Espacements : `s(8)`, `m(16)`, `l(24)`, `xl(32)`, `xxl(40)`
- Border radius : `card(20)`, `button(16)`, `input(14)`
- Typographie : `titleSize(28)`, `subtitleSize(16)`

Persisté dans `AsyncStorage` — le choix de l'utilisateur est conservé entre les sessions.

### 4.6 Notifications Push

```javascript
// notifications.js
requestNotificationPermissions()  // Demande la permission OS
scheduleReminder(id, name, time)  // Programme une notification
cancelAllReminders()              // Annule toutes les notifications

// Intégration avec expo-notifications
// Chaque Reminder créé côté backend → notification locale programmée
```

### 4.7 FlatList vs ScrollView

Les écrans de liste (History, Reminders, Translations) utilisent `FlatList` au lieu de `ScrollView + .map()` :

| ScrollView + .map() | FlatList |
|---------------------|---------|
| Rend TOUS les éléments en mémoire | Virtualisation : ne rend que les éléments visibles |
| Pas de pull-to-refresh intégré | `onRefresh` + `refreshing` intégrés |
| Pas de placeholder vide | `ListEmptyComponent` intégré |
| Lent avec 100+ éléments | Performant même avec 1000+ éléments |

---

## 5. ML Service FastAPI

### 5.1 Architecture modulaire

```
ml_service/app/
├── main.py              # Setup FastAPI, CORS, lifespan, routers
├── dependencies.py      # verify_api_key(), MAX_UPLOAD_SIZE
├── utils.py             # get_device() partagé (GPU/MPS/CPU)
│
├── ocr/                 # Module OCR manuscrit
│   ├── router.py        # POST /predict-handwritten
│   ├── service.py       # Pipeline : bytes → images → preprocess → TrOCR
│   ├── model_loader.py  # Chargement thread-safe du modèle TrOCR
│   └── schemas.py       # OCRResponse (Pydantic)
│
├── translation/         # Module traduction
│   ├── router.py        # POST /translation/translate
│   │                    # GET  /translation/health
│   ├── service.py       # Pipeline : validate → tokenize → generate → decode
│   ├── model_loader.py  # Chargement thread-safe du modèle NLLB
│   └── schemas.py       # TranslateRequest, TranslateResponse (Pydantic)
│
└── processing/
    └── handwriting_preprocess.py  # Prétraitement OpenCV
```

### 5.2 Module OCR (TrOCR)

**Modèle** : `microsoft/trocr-large-printed` (HuggingFace Transformers)

**Pipeline** :
```
Image brute (JPEG/PNG/HEIC/PDF)
    │
    ▼
bytes_to_images()
    │  Convertit en images PIL
    │  PDF : pdf2image (max 10 pages)
    │  HEIC : pillow-heif
    ▼
preprocess_images_for_handwriting()
    │  OpenCV :
    │  1. Conversion RGB → niveaux de gris
    │  2. Binarisation (méthode d'Otsu)
    │  3. Opérations morphologiques (dilatation/érosion)
    │  4. Débruitage
    ▼
trocr_ocr_images()
    │  TrOCR :
    │  1. Processor : prétraitement image + tokenisation
    │  2. Model.generate() : inférence
    │  3. Decode : tokens → texte
    ▼
Texte reconnu (str)
```

**Thread-safety** : Le modèle est chargé une seule fois (lazy loading) avec un `threading.Lock` et double-checked locking pour éviter les race conditions.

### 5.3 Module Traduction (NLLB-200)

**Modèle** : `facebook/nllb-200-distilled-600M` (Meta AI)

- Supporte **200+ langues** (codes BCP-47 : `fra_Latn`, `eng_Latn`, `ara_Arab`, etc.)
- Beam search avec `num_beams=4` pour une meilleure qualité
- Limite : 5000 caractères par requête

**Pipeline** :
```
Texte source + langue source + langue cible
    │
    ▼
Validation des codes langues (format xxx_Yyyy)
    │
    ▼
Tokenisation (AutoTokenizer NLLB)
    │
    ▼
Génération (AutoModelForSeq2SeqLM)
    │  num_beams=4 (beam search)
    │  max_new_tokens configurable (défaut 256)
    ▼
Décodage tokens → texte traduit
```

### 5.4 Lifespan (chargement des modèles)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pré-charge les modèles lourds au démarrage."""
    from app.translation.model_loader import get_nllb_bundle
    logger.info("Pré-chargement du modèle NLLB...")
    get_nllb_bundle()        # ~2-3 Go en RAM
    logger.info("Modèle NLLB prêt.")
    yield                    # L'app tourne ici
    # Shutdown (libération mémoire implicite)
```

**Pourquoi `lifespan` et pas `@app.on_event("startup")` ?**
- `on_event` est déprécié depuis FastAPI 0.93
- `lifespan` est un context manager async propre qui gère startup ET shutdown
- Pattern recommandé par la doc officielle FastAPI

### 5.5 Détection automatique du device

```python
# app/utils.py — partagé entre OCR et Translation
def get_device() -> torch.device:
    forced = os.getenv("DEVICE", "").strip().lower()
    if forced:
        return torch.device(forced)
    if torch.backends.mps.is_available():
        return torch.device("mps")        # Apple Silicon (M1/M2/M3)
    if torch.cuda.is_available():
        return torch.device("cuda")       # GPU NVIDIA
    return torch.device("cpu")            # Fallback
```

### 5.6 Sécurité inter-services

```python
# app/dependencies.py
async def verify_api_key(x_api_key: str = Header(...)):
    """Vérifie la clé API via comparaison HMAC (timing-safe)."""
    expected = os.getenv("ML_API_KEY", "")
    if not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=403, detail="Clé API invalide")
```

Le backend Django envoie `X-API-Key` dans le header de chaque requête au ML Service. Cette clé est partagée via variable d'environnement Docker.

---

## 6. Infrastructure Docker

### 6.1 Architecture des conteneurs

```
docker-compose.yml
│
├── ml_service (Port 8001 — interne uniquement)
│   ├── Image : Python 3.11-slim
│   ├── RAM max : 4 Go (modèles ML volumineux)
│   ├── CPU max : 2 cores
│   ├── Healthcheck : GET /health
│   └── User : mluser (non-root)
│
├── backend (Port 8000 — exposé)
│   ├── Image : Python 3.10-slim (multi-stage)
│   ├── RAM max : 1 Go
│   ├── CPU max : 1 core
│   ├── Dépend de : ml_service (healthcheck)
│   ├── Healthcheck : GET /api/v1/health/
│   ├── User : appuser (non-root)
│   └── Volumes : media_data (fichiers uploadés)
│
└── Réseau : internal (bridge)
    → ml_service accessible uniquement par backend
    → Pas d'accès direct depuis l'extérieur
```

### 6.2 Multi-stage build (Backend)

```dockerfile
# Stage 1 : Base — dépendances système
FROM python:3.10-slim AS base
RUN apt-get install -y tesseract-ocr tesseract-ocr-fra poppler-utils ...

# Stage 2 : Dependencies — packages Python
FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3 : App — code source
FROM deps AS app
COPY . .
RUN python manage.py collectstatic --noinput
RUN useradd -m appuser
USER appuser
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3"]
```

**Avantages du multi-stage** :
- Cache Docker optimisé (les dépendances Python ne sont réinstallées que si `requirements.txt` change)
- Image finale plus légère
- Séparation claire des étapes

---

## 7. Flux de données

### 7.1 Scan d'ordonnance imprimée

```
[1] Utilisateur prend une photo / sélectionne un fichier
              │
[2] ScanScreen → POST /api/v1/files/upload/
              │   Body: multipart/form-data { file, user_id }
              │   Header: Authorization: Bearer <JWT>
              ▼
[3] FileViewSet.upload()
              │   Validation : type de fichier, taille (<10 Mo)
              ▼
[4] upload_service.process_file_upload()
              │
              ├─ PDF détecté → pdfplumber.extract_text()
              │
              └─ Image détectée → pytesseract.image_to_string()
              │
              ▼
[5] prescription_parser.extract_all_prescriptions(texte)
              │   Regex : nom médicament, posologie, fréquence, durée
              ▼
[6] Pour chaque prescription trouvée :
              │   → Prescription.objects.create(...)
              │   → reminder_service.create_auto_reminders(...)
              │       → Reminder.objects.create(...)
              ▼
[7] Réponse JSON :
    {
      "file_id": 42,
      "raw_text": "Dr Martin...",
      "prescriptions": [
        { "medicine_name": "Doliprane", "dosage_med": "500 mg", ... }
      ],
      "reminders_created": 21
    }
              │
[8] Frontend : affiche résultats + programme notifications push
```

### 7.2 Scan d'ordonnance manuscrite

```
[1] Utilisateur sélectionne une image manuscrite
              │
[2] ScanScreen → POST /api/v1/files/upload-handwritten/
              ▼
[3] upload_handwritten_service.process_handwritten_upload()
              │
              │   HTTP interne (réseau Docker)
              ▼
[4] ML Service : POST /predict-handwritten
              │   Header: X-API-Key: <clé partagée>
              │
              ├─ bytes_to_images() : conversion en PIL
              ├─ preprocess_images_for_handwriting() : OpenCV
              └─ trocr_ocr_images() : inférence TrOCR
              │
              ▼
[5] Réponse ML : { "text": "Doliprane 500mg...", "engine": "trocr" }
              │
[6] Backend : parse prescriptions + crée rappels (même pipeline que imprimé)
              ▼
[7] Réponse au frontend
```

### 7.3 Traduction

```
[1] Utilisateur sélectionne une langue cible
              │
[2] POST /api/v1/translation/translate/
              │   { "text": "...", "src_lang": "fra_Latn", "tgt_lang": "eng_Latn" }
              ▼
[3] Backend → translation_service → translation_adapter
              │
              │   HTTP interne
              ▼
[4] ML Service : POST /translation/translate
              │   NLLB-200 : tokenize → generate (beam search) → decode
              ▼
[5] Réponse : { "translated_text": "...", "provider": "nllb" }
              │
[6] Backend : Translation.objects.create(file, original, traduit, langues)
              ▼
[7] Réponse au frontend : texte traduit affiché
```

### 7.4 Cycle de vie d'un rappel

```
[1] Upload ordonnance → prescriptions extraites
              │
[2] reminder_service.create_auto_reminders()
              │   parse_frequency("3 fois par jour") → 3
              │   parse_duration("7 jours") → 7
              │   → 3 × 7 = 21 rappels créés
              │   Heures : 08:00, 14:00, 20:00
              ▼
[3] Frontend : scheduleReminder() pour chaque rappel
              │   → Notification OS programmée
              ▼
[4] À l'heure du rappel : notification push affichée
              │
[5] Utilisateur marque "pris" ou "passé"
              │   PATCH /api/v1/reminders/{id}/
              │   { "status": "taken" }  ou  { "status": "skipped" }
              ▼
[6] Backend met à jour le statut
```

---

## 8. Sécurité

### 8.1 Authentification JWT

```
┌───────────┐                          ┌───────────┐
│  Frontend │                          │  Backend  │
└─────┬─────┘                          └─────┬─────┘
      │                                      │
      │  POST /auth/login/                   │
      │  { username, password }              │
      │─────────────────────────────────────>│
      │                                      │  Vérifie credentials
      │                                      │  Génère JWT (access + refresh)
      │  { access_token, refresh_token }     │
      │<─────────────────────────────────────│
      │                                      │
      │  GET /users/1/reminders/             │
      │  Authorization: Bearer <access>      │
      │─────────────────────────────────────>│
      │                                      │  Vérifie JWT
      │                                      │  Vérifie IsOwner (user.id == 1)
      │  200 OK [...]                        │
      │<─────────────────────────────────────│
      │                                      │
      │  ...5 minutes plus tard...           │
      │  GET /users/1/files/                 │
      │  Authorization: Bearer <access>      │
      │─────────────────────────────────────>│
      │                                      │  JWT expiré → 401
      │  401 Unauthorized                    │
      │<─────────────────────────────────────│
      │                                      │
      │  POST /auth/token/refresh/           │
      │  { refresh: <refresh_token> }        │
      │─────────────────────────────────────>│
      │                                      │  Vérifie refresh token
      │                                      │  Rotation : ancien blacklisté
      │  { access, refresh (nouveau) }       │
      │<─────────────────────────────────────│
      │                                      │
      │  Rejoue GET /users/1/files/          │
      │  Authorization: Bearer <new_access>  │
      │─────────────────────────────────────>│
      │  200 OK                              │
      │<─────────────────────────────────────│
```

### 8.2 Récapitulatif des protections

| Menace | Protection | Implémentation |
|--------|-----------|----------------|
| **IDOR** (accès aux données d'autrui) | Permission `IsOwner` | `request.user.id == pk` sur chaque endpoint user |
| **Brute-force login** | Rate throttling | 5 tentatives/minute max |
| **Vol de token** | Tokens courte durée + rotation | Access 5min, refresh 1j, rotation activée |
| **Upload malveillant** | Validation magic bytes + taille | Types autorisés, max 10 Mo |
| **Path traversal** | Validation filename + sanitization | Regex `^[a-zA-Z0-9_.-]+$` |
| **Injection SQL** | ORM Django | Pas de requêtes SQL brutes |
| **XSS** | React Native (pas de DOM) | N/A côté mobile |
| **Man-in-the-middle** | HTTPS forcé en prod | `http://` → `https://` automatique |
| **Accès ML Service externe** | Réseau Docker interne + API Key | HMAC, réseau `internal` |
| **Privilege escalation Docker** | Users non-root | `appuser`, `mluser` |
| **Mots de passe faibles** | Validation stricte | Min 8 chars, lettres + chiffres obligatoires |
| **Timing attack** (API key) | Comparaison HMAC | `hmac.compare_digest()` en temps constant |

---

## 9. Refactoring qualité — Changelog complet

### Score avant / après

| Couche | Avant | Après |
|--------|-------|-------|
| Backend Django | 6/10 | 9/10 |
| Frontend React Native | 6/10 | 9/10 |
| ML Service FastAPI | 7/10 | 9/10 |

### 9.1 Backend — Ce qui a été fait

#### Permission `IsOwner` (IDOR protection)

**Avant** : chaque action avait 4 lignes de vérification manuelle dupliquées 7 fois :
```python
def list_user_files(self, request, pk=None):
    if request.user.id != int(pk):
        return Response({"error": "Accès interdit"}, status=403)
    ...
```

**Après** : une seule permission DRF réutilisée :
```python
@action(detail=True, permission_classes=[IsAuthenticated, IsOwner])
def list_user_files(self, request, pk=None):
    ...  # Plus de vérification manuelle
```

**Principe appliqué** : **DRY** (Don't Repeat Yourself) + convention DRF

#### Utilitaire `build_medicine_summary()`

**Avant** : même bloc de 6 lignes copié-collé dans 3 actions :
```python
names = [p.medicine_name for p in prescriptions if p.medicine_name]
summary = ", ".join(names[:3])
if len(names) > 3:
    summary += f" +{len(names) - 3} autre(s)"
summary = summary or "Aucun médicament détecté"
```

**Après** : une fonction utilitaire dans `core/utils.py` appelée en une ligne.

**Principe appliqué** : **DRY**

#### Service `upload_handwritten_service.py`

**Avant** : 90 lignes de logique métier inline dans le ViewSet (God Controller)

**Après** : le ViewSet fait 10 lignes, la logique est dans un service dédié.

**Principe appliqué** : **SRP** (Single Responsibility Principle) + Service Layer Pattern

#### Serializers — Champs explicites

**Avant** : `fields = "__all__"` (risque d'exposer des champs sensibles)

**Après** : liste explicite de champs pour chaque serializer.

#### Suppression code mort

- `FileUploadSerializer` — jamais importé → supprimé
- `MessageResponseSerializer` — jamais importé → supprimé

#### Fix `timezone.now()`

**Avant** : `datetime.now()` — ignore le fuseau horaire Django

**Après** : `timezone.now()` — respecte `USE_TZ = True` dans settings.py

#### Basenames DRF

**Avant** : `router.register(r'files', FileViewSet)` — crash si `queryset` pas défini au niveau classe

**Après** : `router.register(r'files', FileViewSet, basename='file')` — résolution explicite

### 9.2 Frontend — Ce qui a été fait

#### Utilitaire `showAlert()` cross-platform

**Avant** : même bloc de 3 lignes dans 4 écrans :
```javascript
if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
else Alert.alert(title, message);
```

**Après** : `import { showAlert } from '../utils/alert'` → `showAlert(title, msg)`

#### Utilitaires `formatDate()` / `formatTime()`

**Avant** : fonctions `formatDate` locales dupliquées dans 3 écrans avec des implémentations légèrement différentes.

**Après** : un seul fichier `src/utils/date.js` avec `formatDate`, `formatShortDate`, `formatTime`.

#### Composant `EmptyState` réutilisable

**Avant** : 3 blocs de JSX identiques (icône + titre + sous-titre) dans History, Reminders, Translations.

**Après** : `<EmptyState icon={...} title="..." subtitle="..." />`

#### FlatList (virtualisation)

**Avant** : `ScrollView` + `.map()` — rend tous les éléments, lent avec beaucoup de données

**Après** : `FlatList` avec `renderItem`, `ListEmptyComponent`, `onRefresh`

#### Intercepteur API — normalisation réponses

**Avant** : `const data = response.data.results || response.data` dans 6 écrans

**Après** : intercepteur Axios dans `api.js` qui normalise automatiquement

#### Suppression code mort

- `src/utils/theme.js` — jamais importé → supprimé
- `const id = userId` (variable redondante) → supprimé dans 4 écrans

### 9.3 ML Service — Ce qui a été fait

#### Module `ocr/` (extraction de `main.py`)

**Avant** : `main.py` faisait ~260 lignes (God File) avec tout mélangé : setup FastAPI, OCR, preprocessing, modèle loading.

**Après** : structure modulaire symétrique à `translation/` :
```
app/ocr/
├── router.py        # Endpoint
├── service.py       # Logique métier
├── model_loader.py  # Chargement modèle (thread-safe)
└── schemas.py       # Modèles Pydantic
```

`main.py` ne fait plus que 62 lignes : setup, CORS, routers, health check.

**Principe appliqué** : **SRP** + **Symétrie architecturale** (OCR et Translation ont la même structure)

#### `get_device()` partagé

**Avant** : fonction `get_device()` dupliquée dans `main.py` et `translation/model_loader.py`

**Après** : une seule fonction dans `app/utils.py`, importée par les deux modules.

#### Lifespan moderne

**Avant** : `@app.on_event("startup")` — déprécié depuis FastAPI 0.93

**Après** : `@asynccontextmanager async def lifespan(app)` — pattern recommandé

#### Schemas Pydantic pour l'OCR

**Avant** : réponse OCR construite comme un `dict` brut

**Après** : `OCRResponse(BaseModel)` avec validation de types + documentation Swagger automatique

---

## 10. Questions techniques probables

### Architecture

**Q : Pourquoi avoir séparé le ML Service du Backend ?**
> Les modèles PyTorch (TrOCR + NLLB) consomment ~4 Go de RAM. Les isoler dans un microservice permet de :
> 1. Scaler indépendamment (plus de GPU si besoin)
> 2. Ne pas ralentir les requêtes REST classiques
> 3. Redémarrer le ML sans impacter l'API
> Le backend communique avec le ML Service via HTTP sur un réseau Docker interne (pas exposé).

**Q : Pourquoi Django et pas FastAPI pour le backend principal ?**
> Django offre un ORM mature, des migrations automatiques, un admin panel, DRF pour les APIs REST, et SimpleJWT pour l'authentification. FastAPI est utilisé pour le ML car il est plus léger et async-native, idéal pour les longues inférences ML.

**Q : C'est quoi le Service Layer Pattern ?**
> Les vues (ViewSets) ne contiennent que la validation des entrées et les réponses HTTP. La logique métier est dans `core/services/`. Avantages :
> - Les services sont testables unitairement sans HTTP
> - Pas de duplication de logique entre plusieurs vues
> - Respect du SRP (Single Responsibility Principle)

### Sécurité

**Q : Comment vous protégez contre les attaques IDOR ?**
> Avec une permission DRF custom `IsOwner` qui vérifie que `request.user.id == pk` dans l'URL. Sans ça, un utilisateur pourrait modifier l'ID dans l'URL et accéder aux données d'un autre.

**Q : Pourquoi JWT et pas des sessions ?**
> JWT est stateless — le serveur n'a pas besoin de stocker l'état de session. C'est mieux pour les apps mobiles et le scaling horizontal. On utilise des access tokens courts (5 min) + refresh tokens (1 jour) avec rotation pour limiter l'impact d'un vol de token.

**Q : Comment vous sécurisez la communication backend ↔ ML Service ?**
> 1. Réseau Docker `internal` — le ML Service n'est pas accessible depuis l'extérieur
> 2. Clé API HMAC partagée via variable d'environnement
> 3. Comparaison en temps constant (`hmac.compare_digest`) contre les timing attacks

### Frontend

**Q : Pourquoi FlatList au lieu de ScrollView ?**
> FlatList virtualise le rendu : seuls les éléments visibles à l'écran sont rendus en mémoire. Avec 100+ rappels, ScrollView + .map() rend tout d'un coup, ce qui cause du lag. FlatList résout ça.

**Q : Comment fonctionne le refresh automatique du JWT ?**
> L'intercepteur Axios détecte les réponses 401. Il met en file d'attente les requêtes concurrentes, fait un POST /auth/token/refresh/ avec le refresh token, puis rejoue toutes les requêtes en attente avec le nouveau access token. Si le refresh échoue, l'utilisateur est déconnecté.

### ML / IA

**Q : Comment fonctionne l'OCR manuscrit (TrOCR) ?**
> TrOCR est un modèle Transformer (encoder-decoder). L'encoder est un Vision Transformer (ViT) qui traite l'image, et le decoder est un modèle de langage qui génère le texte. On utilise le modèle `microsoft/trocr-large-printed` de HuggingFace. Avant l'inférence, on prétraite l'image avec OpenCV (binarisation, débruitage, opérations morphologiques).

**Q : Comment fonctionne la traduction NLLB ?**
> NLLB-200 (No Language Left Behind) est un modèle seq2seq de Meta AI entraîné sur 200+ langues. On utilise la version distillée (600M paramètres) pour un bon compromis qualité/performance. La génération utilise le beam search (num_beams=4) pour explorer plusieurs hypothèses de traduction et garder la meilleure.

**Q : Pourquoi le chargement thread-safe des modèles ?**
> FastAPI est multi-thread (via Uvicorn). Si deux requêtes arrivent en même temps au premier lancement, sans lock, les deux pourraient charger le modèle en parallèle (~8 Go de RAM au lieu de ~4 Go). Le `threading.Lock` avec double-checked locking garantit un seul chargement.

### DevOps

**Q : C'est quoi le multi-stage build Docker ?**
> On découpe le Dockerfile en étapes :
> 1. Base : dépendances système (Tesseract, Poppler)
> 2. Deps : packages Python
> 3. App : code source + collectstatic
> Le cache Docker réutilise les étapes non modifiées. Si seul le code change, seule l'étape 3 est reconstruite (30 secondes au lieu de 5 minutes).

**Q : Pourquoi des utilisateurs non-root dans Docker ?**
> Si un attaquant exploite une vulnérabilité dans l'app, il n'a que les permissions de `appuser`/`mluser` — pas root. C'est un principe de moindre privilège.

### Qualité de code

**Q : C'est quoi le principe DRY et comment vous l'appliquez ?**
> DRY = Don't Repeat Yourself. On a éliminé :
> - 7 vérifications d'ownership dupliquées → 1 permission `IsOwner`
> - 3 blocs de résumé médicament → 1 fonction `build_medicine_summary()`
> - 4 blocs d'alert cross-platform → 1 fonction `showAlert()`
> - 3 fonctions `formatDate` locales → 1 fichier `utils/date.js`
> - 6 normalisations de réponse API → 1 intercepteur Axios
> - 3 blocs d'état vide → 1 composant `EmptyState`

**Q : C'est quoi le SRP (Single Responsibility Principle) ?**
> Chaque module a une seule responsabilité :
> - Views → validation HTTP + réponses
> - Services → logique métier
> - Serializers → sérialisation/validation des données
> - Permissions → contrôle d'accès
> - Processing → extraction de texte
> Avant le refactoring, les views faisaient tout (God Controller anti-pattern).

---

*Rapport généré le 4 mars 2026 — Projet OrdoCare, CAP-PROJET-420*
