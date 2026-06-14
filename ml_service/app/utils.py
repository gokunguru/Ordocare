"""
Utilitaires partagés — ML Service

Fonctions communes aux modules OCR et traduction.
"""

from __future__ import annotations

import os

import torch


def get_device() -> torch.device:
    """Détecte le meilleur device disponible (GPU > MPS > CPU)."""
    forced = os.getenv("DEVICE", "").strip().lower()
    if forced:
        return torch.device(forced)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")
