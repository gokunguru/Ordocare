# processing/handwriting_preprocess.py

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np


def add_white_border_xy(
    img: np.ndarray,
    pad_x: int = 60,
    pad_top: int = 200,
    pad_bottom: int = 120,
) -> np.ndarray:
    """Ajoute une bordure blanche pour éviter que le texte soit collé au bord."""
    return cv2.copyMakeBorder(
        img,
        top=pad_top,
        bottom=pad_bottom,
        left=pad_x,
        right=pad_x,
        borderType=cv2.BORDER_CONSTANT,
        value=255,  # blanc
    )


def auto_crop_to_text(
    bw: np.ndarray,
    padding: int = 25,
    min_area: int = 150,
    remove_border_components: bool = True,
    debug_dir: Optional[str] = None,
) -> np.ndarray:
    """
    Crop automatique autour du texte, robuste aux bords/artefacts.
    bw: binaire fond blanc (255), texte noir (0)
    """
    h, w = bw.shape[:2]

    # masque encre : encre=255, fond=0
    ink = (bw < 128).astype(np.uint8) * 255

    if debug_dir:
        Path(debug_dir).mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(Path(debug_dir) / "debug_ink_raw.png"), ink)

    # nettoyage morpho
    k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k_open, iterations=1)

    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, k_close, iterations=1)

    if remove_border_components:
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)

        cleaned = np.zeros_like(ink)
        for i in range(1, num_labels):
            x, y, ww, hh, area = stats[i]

            if area < min_area:
                continue

            touches_border = (x <= 0) or (y <= 0) or (x + ww >= w) or (y + hh >= h)
            if touches_border:
                continue

            cleaned[labels == i] = 255

        ink = cleaned

    if debug_dir:
        cv2.imwrite(str(Path(debug_dir) / "debug_ink_clean.png"), ink)

    coords = cv2.findNonZero(ink)
    if coords is None:
        return bw

    x, y, ww, hh = cv2.boundingRect(coords)

    x0 = max(x - padding, 0)
    y0 = max(y - padding, 0)
    x1 = min(x + ww + padding, w)
    y1 = min(y + hh + padding, h)

    return bw[y0:y1, x0:x1]


def preprocess_for_handwriting(
    img_bgr: np.ndarray,
    background_kernel: int = 61,
    clahe_clip: float = 3.0,
    clahe_grid: int = 8,
    binarize: str = "otsu",
    adaptive_block: int = 35,
    adaptive_C: int = 10,
    thicken_iters: int = 1,
    denoise_strength: int = 10,
    crop_padding: int = 25,
    crop_min_area: int = 150,
    crop_remove_border_components: bool = True,
    pad_x: int = 60,
    pad_top: int = 200,
    pad_bottom: int = 120,
) -> np.ndarray:
    """
    Retourne une image (uint8) fond blanc / texte noir, crop + padding, prête pour TrOCR.
    """
    debug_dir = os.getenv("HANDWRITING_PREPROCESS_DEBUG_DIR")  # ex: "debug_preprocess" ou vide/None

    # 1) gris + denoise
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, h=denoise_strength)

    # 2) suppression illumination (division)
    if background_kernel % 2 == 0:
        background_kernel += 1
    background = cv2.GaussianBlur(gray, (background_kernel, background_kernel), 0)
    norm = cv2.divide(gray, background, scale=255)

    # 3) CLAHE
    clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(clahe_grid, clahe_grid))
    norm = clahe.apply(norm)

    # 4) binarisation
    if binarize == "adaptive":
        if adaptive_block % 2 == 0:
            adaptive_block += 1
        bw = cv2.adaptiveThreshold(
            norm, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            adaptive_block,
            adaptive_C,
        )
    else:
        _, bw = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 5) forcer texte noir / fond blanc
    if np.mean(bw) < 127:
        bw = cv2.bitwise_not(bw)

    # 6) épaissir l’encre
    ink = cv2.bitwise_not(bw)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    ink = cv2.dilate(ink, k, iterations=thicken_iters)
    bw = cv2.bitwise_not(ink)

    # 7) petit nettoyage (optionnel)
    ink = cv2.bitwise_not(bw)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k2, iterations=1)
    bw = cv2.bitwise_not(ink)

    # 8) crop robuste + padding blanc
    bw = auto_crop_to_text(
        bw,
        padding=crop_padding,
        min_area=crop_min_area,
        remove_border_components=crop_remove_border_components,
        debug_dir=debug_dir,
    )
    bw = add_white_border_xy(bw, pad_x=pad_x, pad_top=pad_top, pad_bottom=pad_bottom)

    if debug_dir:
        cv2.imwrite(str(Path(debug_dir) / "debug_final_bw.png"), bw)

    return bw