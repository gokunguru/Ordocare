"""Tests unitaires — Service d'authentification."""

import pytest

from core.services.auth_service import (
    AuthenticationError,
    ConflictError,
    authenticate_user,
    get_tokens_for_user,
    register_user,
)


@pytest.mark.django_db
class TestRegisterUser:
    def test_register_success(self):
        result = register_user("newuser", "new@test.com", "password123")
        assert result["username"] == "newuser"
        assert result["email"] == "new@test.com"
        assert "access" in result
        assert "refresh" in result
        assert "id" in result

    def test_register_missing_fields(self):
        with pytest.raises(ValueError):
            register_user("", "email@test.com", "password")

        with pytest.raises(ValueError):
            register_user("user", "", "password")

        with pytest.raises(ValueError):
            register_user("user", "email@test.com", "")

    def test_register_duplicate_username(self):
        register_user("dupuser", "dup1@test.com", "password123")
        with pytest.raises(ConflictError, match="Username already taken"):
            register_user("dupuser", "dup2@test.com", "password123")

    def test_register_duplicate_email(self):
        register_user("user1", "same@test.com", "password123")
        with pytest.raises(ConflictError, match="Email already used"):
            register_user("user2", "same@test.com", "password123")


@pytest.mark.django_db
class TestAuthenticateUser:
    def test_login_success(self, user):
        result = authenticate_user("testuser", "password123")
        assert result["username"] == "testuser"
        assert "access" in result
        assert "refresh" in result

    def test_login_wrong_password(self, user):
        with pytest.raises(AuthenticationError):
            authenticate_user("testuser", "wrongpassword")

    def test_login_unknown_user(self):
        with pytest.raises(AuthenticationError):
            authenticate_user("nonexistent", "password")

    def test_login_missing_fields(self):
        with pytest.raises(ValueError):
            authenticate_user("", "password")

        with pytest.raises(ValueError):
            authenticate_user("user", "")


@pytest.mark.django_db
class TestGetTokens:
    def test_tokens_contain_user_info(self, user):
        tokens = get_tokens_for_user(user)
        assert "access" in tokens
        assert "refresh" in tokens
        assert isinstance(tokens["access"], str)
        assert len(tokens["access"]) > 0
