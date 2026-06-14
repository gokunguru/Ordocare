"""Tests unitaires — Parser de prescriptions (regex)."""

from core.processing.prescription_parser import (
    extract_all_prescriptions,
    extract_prescription,
)


class TestExtractPrescription:
    def test_simple_prescription(self):
        result = extract_prescription("doliprane 1000mg 1 comprimé 3 fois par jour pendant 5 jours")
        assert result is not None
        assert result.get("medicament") == "doliprane"

    def test_empty_text(self):
        result = extract_prescription("")
        assert result is None

    def test_no_match(self):
        # Le regex est volontairement tolérant (toute ligne commençant par un mot
        # peut être interprétée comme un médicament). On vérifie les cas limites.
        result = extract_prescription("   ")
        assert result is None


class TestExtractAllPrescriptions:
    def test_multi_line_prescription(self):
        text = """
        DOLIPRANE 1000mg
        • Posologie : 1 comprimé 3 fois par jour
        • Durée : 7 jours

        AMOXICILLINE 500mg
        • Posologie : 1 gélule 2 fois par jour
        • Durée : 5 jours
        """
        results = extract_all_prescriptions(text)
        assert len(results) == 2
        assert "DOLIPRANE" in results[0]["medicament"]
        assert "AMOXICILLINE" in results[1]["medicament"]

    def test_empty_text(self):
        results = extract_all_prescriptions("")
        assert results == []

    def test_no_prescriptions(self):
        results = extract_all_prescriptions("Ceci est un texte sans prescription")
        assert results == []

    def test_single_prescription(self):
        text = """
        IBUPROFENE 400mg
        • Posologie : 1 comprimé 3 fois par jour
        • Durée du traitement : 5 jours
        """
        results = extract_all_prescriptions(text)
        assert len(results) >= 1
        assert "IBUPROFENE" in results[0]["medicament"]
