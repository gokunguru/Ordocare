from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.models import AppUser, File
from core.services.prescription_processing_service import process_ocr_text


def create_test_file():
    user = AppUser.objects.create(
        username="testuser",
        email="test@test.com",
        password="test123",
    )

    uploaded_file = SimpleUploadedFile(
        "test.pdf",
        b"dummy content",
        content_type="application/pdf",
    )

    return File.objects.create(
        user=user,
        file=uploaded_file,
        filename="test.pdf",
    )


@pytest.mark.django_db
@patch("core.services.prescription_processing_service.extract_all_prescriptions")
@patch("core.services.prescription_processing_service.create_auto_reminders")
@patch("core.services.prescription_processing_service.parse_duration")
@patch("core.services.prescription_processing_service.parse_frequency")
def test_process_ocr_text_with_prescription(
    mock_parse_frequency,
    mock_parse_duration,
    mock_create_reminders,
    mock_extract,
):
    # Arrange
    mock_extract.return_value = [
        {
            "medicament": "Doliprane",
            "description": "Antalgique",
            "dosage_med": "500mg",
            "quantite": "1",
            "frequence": "3 fois par jour",
            "duree": "5 jours",
            "condition_si": "",
            "condition": "",
        }
    ]

    mock_parse_duration.return_value = 5
    mock_parse_frequency.return_value = 3
    mock_create_reminders.return_value = [MagicMock(), MagicMock()]

    file_instance = create_test_file()

    # Act
    result = process_ocr_text(file_instance=file_instance, ocr_text="fake text")

    # Assert
    assert len(result.prescriptions_payload) == 1
    assert result.prescriptions_payload[0]["medicine_name"] == "Doliprane"
    assert result.reminders_created == 2


@pytest.mark.django_db
@patch("core.services.prescription_processing_service.extract_all_prescriptions")
def test_process_ocr_text_no_prescriptions(mock_extract):
    mock_extract.return_value = []

    file_instance = create_test_file()

    result = process_ocr_text(file_instance=file_instance, ocr_text="")

    assert result.prescriptions_payload == []
    assert result.reminders_created == 0
