"""Fixtures partagées pour les tests OrdoCare."""

import pytest
from django.contrib.auth.hashers import make_password


@pytest.fixture
def user(db):
    """Crée un utilisateur de test."""
    from core.models import AppUser

    return AppUser.objects.create(
        username="testuser",
        email="test@ordocare.fr",
        password=make_password("password123"),
    )


@pytest.fixture
def other_user(db):
    """Crée un second utilisateur (pour tester l'isolation)."""
    from core.models import AppUser

    return AppUser.objects.create(
        username="otheruser",
        email="other@ordocare.fr",
        password=make_password("password456"),
    )


@pytest.fixture
def file_obj(db, user):
    """Crée un fichier de test associé à l'utilisateur."""
    from core.models import File

    return File.objects.create(
        user=user,
        filename="test_ordonnance.pdf",
    )


@pytest.fixture
def prescription(db, file_obj):
    """Crée une prescription de test."""
    from core.models import Prescription

    return Prescription.objects.create(
        file=file_obj,
        medicine_name="Doliprane",
        dosage_med="1000mg",
        frequency="3 fois par jour",
        duration="7 jours",
    )


@pytest.fixture
def auth_headers(user):
    """Retourne les headers d'authentification JWT pour l'utilisateur de test."""
    from core.services.auth_service import get_tokens_for_user

    tokens = get_tokens_for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {tokens['access']}"}
