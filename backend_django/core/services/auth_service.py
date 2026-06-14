"""
Service d'authentification — Couche Domaine

Contient la logique métier pour l'inscription et la connexion.
Les vues (couche API) délèguent ici et traduisent les exceptions en codes HTTP.

Principe appliqué : Séparation des préoccupations (SoC)
    → La vue ne gère que l'interface HTTP, le service gère la logique métier.
"""

import re

from django.contrib.auth.hashers import check_password, make_password
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import AppUser

MIN_PASSWORD_LENGTH = 8


def _validate_password(password):
    """Valide la complexité du mot de passe. Lève ValueError si trop faible."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères")
    if not re.search(r"[a-zA-Z]", password):
        raise ValueError("Le mot de passe doit contenir au moins une lettre")
    if not re.search(r"\d", password):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")


# ── Exceptions métier ────────────────────────────────────────────────────────


class ConflictError(Exception):
    """Ressource déjà existante (traduit en HTTP 409 par la vue)."""

    pass


class AuthenticationError(Exception):
    """Échec d'authentification (traduit en HTTP 401 par la vue)."""

    pass


# ── Fonctions du service ─────────────────────────────────────────────────────


def get_tokens_for_user(user):
    """Génère une paire de tokens JWT (access + refresh) pour un AppUser."""
    refresh = RefreshToken()
    refresh["user_id"] = user.id
    refresh["username"] = user.username
    refresh["email"] = user.email

    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


def register_user(username, email, password):
    """
    Inscrit un nouvel utilisateur et retourne ses infos + tokens JWT.

    Raises:
        ValueError: champs manquants.
        ConflictError: username ou email déjà pris.
    """
    if not username or not email or not password:
        raise ValueError("Tous les champs sont requis (username, email, password)")

    _validate_password(password)

    if AppUser.objects.filter(username=username).exists():
        raise ConflictError("Username already taken")

    if AppUser.objects.filter(email=email).exists():
        raise ConflictError("Email already used")

    user = AppUser.objects.create(
        username=username,
        email=email,
        password=make_password(password),
    )
    tokens = get_tokens_for_user(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "access": tokens["access"],
        "refresh": tokens["refresh"],
    }


def change_user_password(user_id, current_password, new_password):
    """
    Change le mot de passe d'un utilisateur après vérification de l'ancien.

    Raises:
        ValueError: champs manquants ou mot de passe trop court.
        AuthenticationError: mot de passe actuel incorrect.
    """
    if not current_password or not new_password:
        raise ValueError("Les champs current_password et new_password sont requis")

    _validate_password(new_password)

    try:
        user = AppUser.objects.get(id=user_id)
    except AppUser.DoesNotExist:
        raise AuthenticationError("Utilisateur non trouvé")

    if not check_password(current_password, user.password):
        raise AuthenticationError("Mot de passe actuel incorrect")

    user.password = make_password(new_password)
    user.save()

    return {"message": "Mot de passe modifié avec succès"}


def authenticate_user(username, password):
    """
    Authentifie un utilisateur et retourne ses infos + tokens JWT.

    Raises:
        ValueError: champs manquants.
        AuthenticationError: credentials invalides.
    """
    if not username or not password:
        raise ValueError("Username et password requis")

    try:
        user = AppUser.objects.get(username=username)
        pwd_valid = check_password(password, user.password)
    except AppUser.DoesNotExist:
        # Anti-timing : on simule une vérification de mot de passe
        check_password(password, "pbkdf2_sha256$870000$missing_user_dummy_hash$")
        pwd_valid = False

    if not pwd_valid:
        raise AuthenticationError("Identifiants invalides")

    if not user.is_active:
        raise AuthenticationError("Identifiants invalides")

    tokens = get_tokens_for_user(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "access": tokens["access"],
        "refresh": tokens["refresh"],
    }
