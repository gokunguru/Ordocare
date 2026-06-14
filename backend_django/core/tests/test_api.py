"""Tests d'intégration — Endpoints API REST."""

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client, auth_headers):
    api_client.credentials(**auth_headers)
    return api_client


# ── Auth ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestRegisterEndpoint:
    def test_register_success(self, api_client):
        response = api_client.post(
            "/api/v1/auth/register/",
            {
                "username": "newuser",
                "email": "new@test.com",
                "password": "password123",
            },
            format="json",
        )
        assert response.status_code == 201
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["username"] == "newuser"

    def test_register_missing_fields(self, api_client):
        response = api_client.post(
            "/api/v1/auth/register/",
            {
                "username": "user",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_register_duplicate_username(self, api_client, user):
        response = api_client.post(
            "/api/v1/auth/register/",
            {
                "username": "testuser",  # already exists via user fixture
                "email": "unique@test.com",
                "password": "password123",
            },
            format="json",
        )
        assert response.status_code == 409

    def test_register_duplicate_email(self, api_client, user):
        response = api_client.post(
            "/api/v1/auth/register/",
            {
                "username": "uniqueuser",
                "email": "test@ordocare.fr",  # already exists via user fixture
                "password": "password123",
            },
            format="json",
        )
        assert response.status_code == 409


@pytest.mark.django_db
class TestLoginEndpoint:
    def test_login_success(self, api_client, user):
        response = api_client.post(
            "/api/v1/auth/login/",
            {
                "username": "testuser",
                "password": "password123",
            },
            format="json",
        )
        assert response.status_code == 200
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_wrong_password(self, api_client, user):
        response = api_client.post(
            "/api/v1/auth/login/",
            {
                "username": "testuser",
                "password": "wrongpassword",
            },
            format="json",
        )
        assert response.status_code == 401

    def test_login_missing_fields(self, api_client):
        response = api_client.post("/api/v1/auth/login/", {}, format="json")
        assert response.status_code == 400


# ── Users / Sous-ressources ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestUserEndpoints:
    def test_list_users(self, auth_client, user):
        response = auth_client.get("/api/v1/users/")
        assert response.status_code == 200

    def test_user_files_requires_auth(self, api_client, user):
        response = api_client.get(f"/api/v1/users/{user.id}/files/")
        assert response.status_code == 401

    def test_user_files_own_data(self, auth_client, user):
        response = auth_client.get(f"/api/v1/users/{user.id}/files/")
        assert response.status_code == 200

    def test_user_files_other_user_forbidden(self, auth_client, other_user):
        response = auth_client.get(f"/api/v1/users/{other_user.id}/files/")
        assert response.status_code == 403

    def test_user_prescriptions_own_data(self, auth_client, user):
        response = auth_client.get(f"/api/v1/users/{user.id}/prescriptions/")
        assert response.status_code == 200

    def test_user_prescriptions_other_user_forbidden(self, auth_client, other_user):
        response = auth_client.get(f"/api/v1/users/{other_user.id}/prescriptions/")
        assert response.status_code == 403

    def test_user_reminders_own_data(self, auth_client, user):
        response = auth_client.get(f"/api/v1/users/{user.id}/reminders/")
        assert response.status_code == 200

    def test_medical_profile_own_data(self, auth_client, user):
        response = auth_client.get(f"/api/v1/users/{user.id}/medical-profile/")
        assert response.status_code == 200

    def test_medical_profile_other_user_forbidden(self, auth_client, other_user):
        response = auth_client.get(f"/api/v1/users/{other_user.id}/medical-profile/")
        assert response.status_code == 403


# ── Reminders ────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestReminderEndpoints:
    def test_list_reminders_requires_auth(self, api_client):
        response = api_client.get("/api/v1/reminders/")
        assert response.status_code == 401

    def test_create_reminder(self, auth_client, prescription):
        response = auth_client.post(
            "/api/v1/reminders/",
            {
                "prescription_id": prescription.id,
                "reminder_time": "2026-02-01T08:00:00Z",
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["prescription"] == prescription.id

    def test_create_reminder_missing_fields(self, auth_client):
        response = auth_client.post("/api/v1/reminders/", {}, format="json")
        assert response.status_code == 400

    def test_create_reminder_invalid_prescription(self, auth_client):
        response = auth_client.post(
            "/api/v1/reminders/",
            {
                "prescription_id": 99999,
                "reminder_time": "2026-02-01T08:00:00Z",
            },
            format="json",
        )
        assert response.status_code == 404

    def test_delete_reminder_returns_204(self, auth_client, prescription):
        # Create a reminder first
        create_resp = auth_client.post(
            "/api/v1/reminders/",
            {
                "prescription_id": prescription.id,
                "reminder_time": "2026-02-01T08:00:00Z",
            },
            format="json",
        )
        reminder_id = create_resp.data["id"]

        response = auth_client.delete(f"/api/v1/reminders/{reminder_id}/")
        assert response.status_code == 204


# ── Swagger ──────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSwagger:
    def test_swagger_ui_accessible(self, api_client):
        response = api_client.get("/swagger/")
        assert response.status_code == 200

    def test_swagger_json_accessible(self, api_client):
        response = api_client.get("/swagger.json")
        assert response.status_code == 200

    def test_redoc_accessible(self, api_client):
        response = api_client.get("/redoc/")
        assert response.status_code == 200
