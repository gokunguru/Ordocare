"""Tests unitaires — Service de rappels."""

import pytest

from core.services.reminder_service import (
    create_auto_reminders,
    parse_duration,
    parse_frequency,
)


class TestParseFrequency:
    def test_fois_par_jour(self):
        assert parse_frequency("3 fois par jour") == 3
        assert parse_frequency("2 fois par jour") == 2
        assert parse_frequency("1 fois par jour") == 1

    def test_slash_j(self):
        assert parse_frequency("3/j") == 3
        assert parse_frequency("2/jour") == 2

    def test_matin_soir(self):
        assert parse_frequency("matin et soir") == 2

    def test_matin_midi_soir(self):
        assert parse_frequency("matin midi soir") == 3

    def test_none_input(self):
        assert parse_frequency(None) is None
        assert parse_frequency("") is None

    def test_unrecognized(self):
        assert parse_frequency("quand tu veux") is None


class TestParseDuration:
    def test_jours(self):
        assert parse_duration("7 jours") == 7
        assert parse_duration("5 jours") == 5
        assert parse_duration("10 j") == 10

    def test_semaines(self):
        assert parse_duration("2 semaines") == 14
        assert parse_duration("1 semaine") == 7

    def test_mois(self):
        assert parse_duration("1 mois") == 30
        assert parse_duration("2 mois") == 60

    def test_none_input(self):
        assert parse_duration(None) is None
        assert parse_duration("") is None

    def test_unrecognized(self):
        assert parse_duration("longtemps") is None


@pytest.mark.django_db
class TestCreateAutoReminders:
    def test_creates_reminders(self, prescription):
        reminders = create_auto_reminders(prescription, times_per_day=3, num_days=2)
        # 3 prises/jour * 2 jours = 6 rappels max (moins ceux dans le passé)
        assert len(reminders) > 0
        for r in reminders:
            assert r.prescription == prescription
            assert r.status == "pending"
            assert r.notified is False

    def test_none_inputs(self, prescription):
        assert create_auto_reminders(prescription, None, 7) == []
        assert create_auto_reminders(prescription, 3, None) == []
        assert create_auto_reminders(prescription, None, None) == []
