from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class LanguageOption:
    code: str  # ex: "eng_Latn"
    label: str  # ex: "English"


_DEFAULT_LANGUAGES: List[LanguageOption] = [
    # Europe
    LanguageOption(code="fra_Latn", label="French"),
    LanguageOption(code="eng_Latn", label="English"),
    LanguageOption(code="spa_Latn", label="Spanish"),
    LanguageOption(code="por_Latn", label="Portuguese"),
    LanguageOption(code="ita_Latn", label="Italian"),
    LanguageOption(code="deu_Latn", label="German"),
    LanguageOption(code="nld_Latn", label="Dutch"),
    LanguageOption(code="pol_Latn", label="Polish"),
    LanguageOption(code="ron_Latn", label="Romanian"),
    LanguageOption(code="ces_Latn", label="Czech"),
    LanguageOption(code="slk_Latn", label="Slovak"),
    LanguageOption(code="slv_Latn", label="Slovenian"),
    LanguageOption(code="hrv_Latn", label="Croatian"),
    LanguageOption(code="ell_Grek", label="Greek"),
    LanguageOption(code="bul_Cyrl", label="Bulgarian"),
    LanguageOption(code="ukr_Cyrl", label="Ukrainian"),
    LanguageOption(code="rus_Cyrl", label="Russian"),
    LanguageOption(code="swe_Latn", label="Swedish"),
    LanguageOption(code="dan_Latn", label="Danish"),
    LanguageOption(code="fin_Latn", label="Finnish"),
    # Moyen-Orient / Afrique du Nord
    LanguageOption(code="arb_Arab", label="Arabic (Standard)"),
    LanguageOption(code="heb_Hebr", label="Hebrew"),
    LanguageOption(code="tur_Latn", label="Turkish"),
    LanguageOption(code="pes_Arab", label="Persian"),
    # Afrique
    LanguageOption(code="amh_Ethi", label="Amharic"),
    LanguageOption(code="swh_Latn", label="Swahili"),
    LanguageOption(code="hau_Latn", label="Hausa"),
    LanguageOption(code="yor_Latn", label="Yoruba"),
    LanguageOption(code="zul_Latn", label="Zulu"),
    # Asie
    LanguageOption(code="zho_Hans", label="Chinese (Simplified)"),
    LanguageOption(code="zho_Hant", label="Chinese (Traditional)"),
    LanguageOption(code="jpn_Jpan", label="Japanese"),
    LanguageOption(code="kor_Hang", label="Korean"),
    LanguageOption(code="hin_Deva", label="Hindi"),
    LanguageOption(code="ben_Beng", label="Bengali"),
    LanguageOption(code="tam_Taml", label="Tamil"),
    LanguageOption(code="tel_Telu", label="Telugu"),
    LanguageOption(code="tha_Thai", label="Thai"),
    LanguageOption(code="vie_Latn", label="Vietnamese"),
    LanguageOption(code="ind_Latn", label="Indonesian"),
    LanguageOption(code="zsm_Latn", label="Malay"),
]


def list_language_options() -> List[Dict[str, str]]:
    """
    Retourne une liste prête pour le frontend:
    [{ "code": "...", "label": "..." }, ...]
    """
    # tri alpha par label
    options = sorted(_DEFAULT_LANGUAGES, key=lambda x: x.label.lower())
    return [{"code": opt.code, "label": opt.label} for opt in options]
