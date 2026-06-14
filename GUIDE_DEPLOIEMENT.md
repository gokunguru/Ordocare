# Guide de Déploiement — OrdoCare

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Architecture de déploiement](#2-architecture-de-déploiement)
3. [Installation sur le serveur](#3-installation-sur-le-serveur)
4. [Configuration des variables d'environnement](#4-configuration-des-variables-denvironnement)
5. [Lancement de l'application](#5-lancement-de-lapplication)
6. [Vérification du déploiement](#6-vérification-du-déploiement)
7. [Configuration du frontend mobile](#7-configuration-du-frontend-mobile)
8. [Commandes d'administration](#8-commandes-dadministration)
9. [Monitoring et logs](#9-monitoring-et-logs)
10. [Dépannage](#10-dépannage)

---

## 1. Prérequis

### Serveur

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| RAM | 6 Go | 8 Go |
| CPU | 2 cores | 4 cores |
| Disque | 20 Go | 50 Go |
| OS | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |

> **Pourquoi 6 Go de RAM minimum ?**
> - ML Service (modèles NLLB + TrOCR) : ~4 Go
> - Backend Django (Gunicorn 3 workers) : ~500 Mo
> - PostgreSQL : ~500 Mo
> - Système : ~1 Go

### Logiciels requis

```bash
# Docker + Docker Compose (v2)
docker --version        # Docker 24+
docker compose version  # Compose v2.20+

# Git
git --version           # Git 2.30+
```

### Installation de Docker (si pas installé)

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker

# Ajouter l'utilisateur au groupe docker (évite sudo)
sudo usermod -aG docker $USER
# Se reconnecter pour appliquer
```

### Ports réseau

| Port | Service | Accès |
|------|---------|-------|
| 8000 | Backend API (Gunicorn) | Ouvert (public) |
| 8001 | ML Service (Uvicorn) | Fermé (interne Docker uniquement) |
| 5432 | PostgreSQL | Fermé (interne Docker uniquement) |

> Seul le port **8000** doit être ouvert dans le pare-feu du serveur.

---

## 2. Architecture de déploiement

```
┌──────────────────────────────────────────────────────────────┐
│                      SERVEUR ÉCOLE                           │
│                                                              │
│  ┌─────────────────── Docker Compose ──────────────────────┐ │
│  │                                                         │ │
│  │  ┌──────────┐    ┌──────────────┐    ┌──────────────┐   │ │
│  │  │PostgreSQL │    │   Backend    │    │  ML Service   │   │ │
│  │  │  (db)     │◄───│  (Django)    │───►│  (FastAPI)    │   │ │
│  │  │ Port 5432 │    │  Port 8000   │    │  Port 8001    │   │ │
│  │  └──────────┘    └──────┬───────┘    └──────────────┘   │ │
│  │                         │                               │ │
│  │              Réseau interne Docker                       │ │
│  └─────────────────────────┼───────────────────────────────┘ │
│                            │ Port 8000 exposé                │
└────────────────────────────┼─────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  App Mobile     │
                    │  (React Native) │
                    │  sur téléphones  │
                    └─────────────────┘
```

**3 conteneurs Docker** :
1. **db** — PostgreSQL 16 : stocke les utilisateurs, fichiers, prescriptions, rappels
2. **ml_service** — FastAPI + PyTorch : OCR manuscrit (TrOCR) + traduction (NLLB-200)
3. **backend** — Django + Gunicorn : API REST, authentification JWT, OCR imprimé (Tesseract)

**Ordre de démarrage** : `db` → `ml_service` → `backend` (chacun attend que le précédent soit healthy)

---

## 3. Installation sur le serveur

### 3.1 Connexion au serveur

```bash
ssh utilisateur@serveur-ecole.fr
```

### 3.2 Cloner le projet

```bash
git clone https://github.com/YACINE-CODE16/CAP-PROJET-420.git
cd CAP-PROJET-420
```

### 3.3 Vérifier la branche

```bash
git branch
# Doit afficher : * main
# Si ce n'est pas main :
git checkout main
```

---

## 4. Configuration des variables d'environnement

### 4.1 Variables Docker (`.env` à la racine)

```bash
cp .env.example .env
nano .env
```

Contenu à remplir :

```bash
# Générer une clé API ML (copier-coller le résultat)
openssl rand -hex 32
# Exemple : a1b2c3d4e5f6...

# Générer un mot de passe PostgreSQL
openssl rand -hex 16
# Exemple : 8f3a2b1c...
```

```env
# .env
ML_API_KEY=<coller la clé générée>
DB_PASSWORD=<coller le mot de passe généré>
```

### 4.2 Variables Django (`.env.prod` dans backend_django/)

```bash
cp backend_django/.env.example backend_django/.env.prod
nano backend_django/.env.prod
```

Modifier ces valeurs :

```env
# backend_django/.env.prod

# === Django ===
SECRET_KEY=<openssl rand -hex 50>
DEBUG=False
ENVIRONMENT=production
ALLOWED_HOSTS=serveur-ecole.fr,<IP_DU_SERVEUR>

# === Base de données ===
# Laisser commenté — la config PostgreSQL est dans docker-compose.prod.yml

# === JWT ===
ACCESS_TOKEN_LIFETIME_MINUTES=5
REFRESH_TOKEN_LIFETIME_DAYS=1

# === CORS ===
# Si l'app mobile accède depuis un domaine spécifique :
# CORS_ORIGINS=http://serveur-ecole.fr:8000

# === Logging ===
LOG_LEVEL=WARNING
```

### 4.3 Récapitulatif des secrets à générer

| Secret | Commande | Où le mettre |
|--------|----------|--------------|
| ML_API_KEY | `openssl rand -hex 32` | `.env` |
| DB_PASSWORD | `openssl rand -hex 16` | `.env` |
| SECRET_KEY | `openssl rand -hex 50` | `backend_django/.env.prod` |

> **Important** : Ne jamais commit ces fichiers `.env` et `.env.prod` — ils sont dans le `.gitignore`.

---

## 5. Lancement de l'application

### 5.1 Build et démarrage

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

> Le premier lancement prend **5-10 minutes** :
> - Build des images Docker (~3 min)
> - Téléchargement des modèles ML au premier démarrage (~2-5 min selon la connexion)
> - Migrations de la base de données (~10 sec)

### 5.2 Suivre le démarrage en temps réel

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Séquence attendue :

```
ordocare-db       | database system is ready to accept connections
ordocare-ml       | INFO:     Uvicorn running on http://0.0.0.0:8001
ordocare-ml       | INFO:ml_service:Pré-chargement du modèle NLLB...
ordocare-ml       | INFO:ml_service:Modèle NLLB prêt.
ordocare-backend  | Operations to perform: Apply all migrations...
ordocare-backend  | Running migrations: OK
ordocare-backend  | [INFO] Starting gunicorn 0.0.0.0:8000
ordocare-backend  | [INFO] Booting worker with pid: ...
ordocare-backend  | [INFO] Booting worker with pid: ...
ordocare-backend  | [INFO] Booting worker with pid: ...
```

### 5.3 Vérifier que tout est UP

```bash
docker compose -f docker-compose.prod.yml ps
```

Résultat attendu :

```
NAME               STATUS                  PORTS
ordocare-db        Up (healthy)
ordocare-ml        Up (healthy)
ordocare-backend   Up (healthy)            0.0.0.0:8000->8000/tcp
```

Les 3 services doivent être `Up (healthy)`.

---

## 6. Vérification du déploiement

### 6.1 Health checks

```bash
# Backend
curl http://localhost:8000/api/v1/health/
# Réponse attendue : {"status": "ok"}

# ML Service (depuis l'intérieur du réseau Docker)
docker compose -f docker-compose.prod.yml exec backend curl http://ml_service:8001/health
# Réponse attendue : {"status": "ok"}
```

### 6.2 Test d'inscription

```bash
curl -X POST http://localhost:8000/api/v1/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@test.com", "password": "Test1234"}'
```

Réponse attendue :
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@test.com",
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### 6.3 Test de connexion

```bash
curl -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "Test1234"}'
```

### 6.4 Test des langues de traduction

```bash
TOKEN="<access_token du login>"

curl http://localhost:8000/api/v1/translation/languages/ \
  -H "Authorization: Bearer $TOKEN"
```

### 6.5 Test depuis l'extérieur

Depuis un autre poste (remplacer par l'IP/domaine du serveur) :

```bash
curl http://serveur-ecole.fr:8000/api/v1/health/
```

Si ça ne répond pas → vérifier le pare-feu (port 8000).

---

## 7. Configuration du frontend mobile

L'application React Native doit pointer vers l'URL du serveur.

### 7.1 Modifier l'URL de l'API

Sur le poste de développement, créer/modifier le fichier `.env` à la racine du projet :

```env
EXPO_PUBLIC_API_URL=http://serveur-ecole.fr:8000/api/v1
```

### 7.2 Lancer l'application mobile

```bash
# Installer les dépendances (première fois)
npm install

# Lancer Expo
npx expo start
```

Puis :
- **Sur téléphone** : Scanner le QR code avec l'app Expo Go
- **Sur navigateur** : Appuyer sur `w` pour ouvrir en mode web
- **Sur émulateur** : Appuyer sur `a` (Android) ou `i` (iOS)

### 7.3 Important pour le réseau

Le téléphone et le serveur doivent être sur le **même réseau** (WiFi de l'école) ou le serveur doit être accessible depuis Internet.

```
Téléphone (WiFi école) ──► Serveur école (port 8000) ──► Docker (backend)
```

---

## 8. Commandes d'administration

### Gestion des conteneurs

```bash
# Démarrer les services
docker compose -f docker-compose.prod.yml up -d

# Arrêter les services
docker compose -f docker-compose.prod.yml down

# Redémarrer un service spécifique
docker compose -f docker-compose.prod.yml restart backend

# Reconstruire après modification du code
docker compose -f docker-compose.prod.yml up --build -d
```

### Base de données

```bash
# Accéder au shell PostgreSQL
docker compose -f docker-compose.prod.yml exec db psql -U ordocare_user -d ordocare

# Commandes SQL utiles :
# \dt                           → lister les tables
# SELECT * FROM core_appuser;   → voir les utilisateurs
# SELECT COUNT(*) FROM core_prescription;  → compter les prescriptions
# \q                            → quitter
```

### Django

```bash
# Shell Django (debug)
docker compose -f docker-compose.prod.yml exec backend python manage.py shell

# Créer un superuser (accès admin Django)
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# Lancer les migrations manuellement
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Supprimer les prescriptions expirées
docker compose -f docker-compose.prod.yml exec backend python manage.py delete_expired_prescriptions
```

### Mise à jour du code

```bash
# Récupérer les dernières modifications
git pull origin main

# Reconstruire et relancer
docker compose -f docker-compose.prod.yml up --build -d
```

---

## 9. Monitoring et logs

### Voir les logs en temps réel

```bash
# Tous les services
docker compose -f docker-compose.prod.yml logs -f

# Un service spécifique
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f ml_service
docker compose -f docker-compose.prod.yml logs -f db
```

### Voir les dernières erreurs

```bash
# 50 dernières lignes du backend
docker compose -f docker-compose.prod.yml logs --tail=50 backend
```

### Ressources utilisées

```bash
# CPU et RAM par conteneur
docker stats --no-stream
```

Sortie type :
```
CONTAINER         CPU %   MEM USAGE / LIMIT
ordocare-ml       0.5%    3.2GiB / 4GiB
ordocare-backend  0.3%    280MiB / 1GiB
ordocare-db       0.1%    45MiB / No limit
```

### Espace disque

```bash
# Espace utilisé par Docker
docker system df

# Nettoyer les images inutilisées
docker system prune -f
```

---

## 10. Dépannage

### Le backend ne démarre pas

**Symptôme** : `ordocare-backend` en état `Restarting` ou `Exit 1`

```bash
# Voir les logs d'erreur
docker compose -f docker-compose.prod.yml logs backend
```

**Causes fréquentes** :

| Erreur | Cause | Solution |
|--------|-------|----------|
| `SECRET_KEY must be set` | `.env.prod` manquant ou incomplet | Vérifier `backend_django/.env.prod` |
| `could not connect to server` | PostgreSQL pas encore prêt | Attendre 30s, le healthcheck gère ça |
| `ML_API_KEY must be set` | `.env` racine manquant | Vérifier `.env` à la racine |
| `ModuleNotFoundError` | Image Docker pas à jour | `docker compose -f docker-compose.prod.yml up --build -d` |

### Le ML Service est lent au démarrage

C'est **normal** — le chargement des modèles (NLLB ~600M paramètres) prend 1-3 minutes. Le healthcheck a un `start_period: 60s` pour ça. Le backend attend que le ML soit healthy avant de démarrer.

### L'app mobile ne se connecte pas au serveur

```
1. Vérifier que le serveur répond :
   curl http://serveur-ecole.fr:8000/api/v1/health/

2. Vérifier le pare-feu (port 8000 ouvert) :
   sudo ufw allow 8000

3. Vérifier que le téléphone est sur le même réseau

4. Vérifier EXPO_PUBLIC_API_URL dans le .env du projet Expo

5. Vérifier ALLOWED_HOSTS dans backend_django/.env.prod
   → doit inclure l'IP/domaine du serveur
```

### Erreur CORS

```
Access-Control-Allow-Origin header missing
```

**Solution** : Ajouter l'origine dans `backend_django/.env.prod` :
```env
CORS_ORIGINS=http://serveur-ecole.fr:8000,http://localhost:19006
```

### Reset complet (tout recommencer)

```bash
# Arrêter et supprimer TOUT (conteneurs + volumes + données)
docker compose -f docker-compose.prod.yml down -v

# Supprimer les images
docker compose -f docker-compose.prod.yml down --rmi all

# Relancer de zéro
docker compose -f docker-compose.prod.yml up --build -d
```

> **Attention** : `down -v` supprime la base de données et tous les fichiers uploadés.

### Backup de la base de données

```bash
# Exporter
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U ordocare_user ordocare > backup_$(date +%Y%m%d).sql

# Restaurer
cat backup_20260304.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U ordocare_user -d ordocare
```

---

## Checklist de déploiement

- [ ] Docker et Docker Compose installés sur le serveur
- [ ] Projet cloné (`git clone`)
- [ ] `.env` créé avec `ML_API_KEY` et `DB_PASSWORD`
- [ ] `backend_django/.env.prod` créé avec `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`
- [ ] `docker compose -f docker-compose.prod.yml up --build -d` exécuté
- [ ] Les 3 services sont `Up (healthy)` (`docker compose ps`)
- [ ] `curl http://localhost:8000/api/v1/health/` retourne `{"status": "ok"}`
- [ ] Port 8000 ouvert dans le pare-feu
- [ ] Test d'inscription + connexion OK
- [ ] `EXPO_PUBLIC_API_URL` configuré dans l'app mobile
- [ ] App mobile connectée et fonctionnelle

---

*Guide de déploiement OrdoCare — Mars 2026*
