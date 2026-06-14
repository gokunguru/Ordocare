#!/bin/bash
# ══════════════════════════════════════════════════════════════
# OrdoCare — Script de démarrage (Backend Django + ML Service)
#
# Usage : ./start.sh
# ══════════════════════════════════════════════════════════════

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
    echo ""
    echo "Arrêt des services..."
    if [ -n "$ML_PID" ]; then
        kill "$ML_PID" 2>/dev/null || true
    fi
    if [ -n "$DJANGO_PID" ]; then
        kill "$DJANGO_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# ── 1. Démarrage du service ML (FastAPI sur port 8001) ──
echo "[OrdoCare] Démarrage du service ML (port 8001)..."
cd "$PROJECT_DIR/ml_service"
if [ -d "venv" ]; then
    source venv/bin/activate
fi
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --log-level info &
ML_PID=$!
echo "[OrdoCare] ML Service PID: $ML_PID"

# ── 2. Démarrage du backend Django (port 8000) ──
echo "[OrdoCare] Démarrage du backend Django (port 8000)..."
cd "$PROJECT_DIR/backend_django"
if [ -d "venv" ]; then
    source venv/bin/activate
fi
python manage.py migrate --run-syncdb 2>/dev/null || true
python manage.py runserver 0.0.0.0:8000 &
DJANGO_PID=$!
echo "[OrdoCare] Django PID: $DJANGO_PID"

echo ""
echo "══════════════════════════════════════════════════"
echo "  OrdoCare démarré !"
echo "  Backend Django : http://localhost:8000"
echo "  Swagger API    : http://localhost:8000/swagger/"
echo "  ML Service     : http://localhost:8001"
echo "  ML Health      : http://localhost:8001/health"
echo "══════════════════════════════════════════════════"
echo ""

# Attendre que les deux processus tournent
wait
