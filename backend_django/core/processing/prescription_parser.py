import re

import pdfplumber

# Patterns de base
DOSAGE_MED = r"(?:\d+(?:[.,]\d+)?\s*(?:mg|g|ml|µg|mcg|g/l))"
QUANTITE = r"(?:\d+\s*(?:comprimé(?:s)?|gélule(?:s)?|sachet(?:s)?|ampoule(?:s)?|cp|gel))"

# Fréquences (inclut 3/j, x3/j, etc.)
FREQUENCES = (
    r"(?:"
    r"\d+\s*fois\s*par\s*jour|"  # 3 fois par jour
    r"\d+\s*(?:par\s*jour|/j(?:our)?)|"  # 3/j, 3/jour, 3 par jour
    r"x\s*\d+\s*/\s*j(?:our)?|"  # x3/j, x 3/j, x3/jour
    r"matin\s+midi\s+soir|"  # matin midi soir
    r"matin\s+et\s+soir|"  # matin et soir
    r"matin|midi|soir|nuit|"  # moments de la journée
    r"toutes\s+les\s+\d+\s+heures"  # toutes les 6 heures
    r")"
)

CONDITIONS_SI = r"(?:si\s+[A-Za-zÀ-ÿ0-9\- ]+)"
# Durée : 5 jours, 5 j, 2 semaines, 2 sem, 1 mois...
DUREE = r"(?:\d+\s*(?:j|jour|jours?|sem|semaines?|mois))"

CONDITIONS = (
    r"(?:"
    r"avant\s+repas|"
    r"après\s+repas|"
    r"avant\s+le\s+repas|"
    r"apres\s+le\s+repas|"
    r"avant\s+manger|"
    r"après\s+manger"
    r")"
)

# Mots intermédiaires
MOTS_INTER = r"(?:prendre|utiliser|administrer|donner)"


def extract_prescription(text: str):
    # Normalisation du texte
    text = text.lower()
    text = re.sub(r"[ \t]+", " ", text)

    pattern = rf"""
    ^\s*
    (?P<medicament>[a-zà-ÿ0-9\-]+)                 # NOM DU MEDICAMENT (un mot)
    (?P<description>(?:\s+[a-zà-ÿ\-]+)*)           # mots descriptifs sans chiffres (adultes, enfant, menthe, lyoc...)
    \s*
    (?P<dosage_med>{DOSAGE_MED})?                 # 1 g / 500 mg (OPTIONNEL)
    \s*
    {MOTS_INTER}?                                 # prendre / utiliser / ...
    \s*
    (?P<quantite>{QUANTITE})?                     # 1 comprimé / 2 cp / 1 sachet...
    \s*
    (?P<frequence>{FREQUENCES})?                  # matin et soir, 3/j, x3/j, toutes les 6 heures...
    \s*
    (?:pendant|pour)?\s*(?P<duree>{DUREE})?       # pendant 5 jours, 5 j, 2 sem, 1 mois...
    \s*
    (?P<condition_si>{CONDITIONS_SI})?            # si douleur, si fièvre...
    \s*
    (?P<condition>{CONDITIONS})?                  # avant repas, après repas...
    """

    match = re.search(pattern, text, re.VERBOSE)
    if match:
        # on strip description
        return {k: v.strip() for k, v in match.groupdict().items() if v and v.strip()}

    return None


def extract_all_prescriptions(text: str):
    """
    Extrait toutes les prescriptions d'un texte potentiellement multi-lignes.

    Format typique d'ordonnance française:
    MEDICAMENT 500mg
    • Posologie : 1 gélule 3 fois par jour
    • Durée : 7 jours
    """

    prescriptions = []
    lignes = text.splitlines()

    i = 0
    while i < len(lignes):
        ligne = lignes[i].strip()

        # Ignorer les lignes vides ou trop courtes
        if not ligne or len(ligne) < 3:
            i += 1
            continue

        # Chercher une ligne avec un dosage (mg, g, ml) = nom du médicament
        match_dosage = re.search(r"([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s\-]+)\s+(" + DOSAGE_MED + r")", ligne, re.IGNORECASE)

        if match_dosage:
            medicament = match_dosage.group(1).strip() + " " + match_dosage.group(2).strip()

            # Chercher la fréquence dans les 5 lignes suivantes
            frequence = None
            duree = None

            for j in range(i + 1, min(i + 6, len(lignes))):
                ligne_suiv = lignes[j].strip()

                # Chercher la fréquence (après "Posologie" ou directement)
                if not frequence:
                    # Patterns de fréquence plus précis
                    freq_match = re.search(
                        r"(\d+)\s*(?:gélule(?:s)?|comprimé(?:s)?|cp|sachet(?:s)?)\s+(\d+)\s*fois\s*par\s*jour",
                        ligne_suiv,
                        re.IGNORECASE,
                    )
                    if freq_match:
                        frequence = f"{freq_match.group(2)} fois par jour"
                    else:
                        # Essayer d'autres formats
                        freq_match2 = re.search(r"(\d+)\s*fois\s*par\s*jour", ligne_suiv, re.IGNORECASE)
                        if freq_match2:
                            frequence = freq_match2.group(0)
                        else:
                            freq_match3 = re.search(r"(\d+)\s*/\s*j(?:our)?", ligne_suiv, re.IGNORECASE)
                            if freq_match3:
                                frequence = f"{freq_match3.group(1)} fois par jour"

                # Chercher la durée (après "Durée" ou "pendant")
                if not duree:
                    duree_match = re.search(
                        r"(?:durée|pendant|pour)\s*(?:du\s+traitement)?\s*:\s*(\d+)\s*(jour(?:s)?|j\b|semaine(?:s)?|sem|mois)",
                        ligne_suiv,
                        re.IGNORECASE,
                    )
                    if duree_match:
                        duree = f"{duree_match.group(1)} {duree_match.group(2)}"
                    else:
                        # Format sans "durée :"
                        duree_match2 = re.search(
                            r"(\d+)\s*(jour(?:s)?|j\b|semaine(?:s)?|sem|mois)",
                            ligne_suiv,
                            re.IGNORECASE,
                        )
                        if duree_match2 and "quantité" not in ligne_suiv.lower():
                            duree = f"{duree_match2.group(1)} {duree_match2.group(2)}"

            # Créer la prescription
            prescription = {
                "medicament": medicament,
                "frequence": frequence or "",
                "duree": duree or "",
                "dosage_med": match_dosage.group(2).strip(),
                "description": "",
            }

            prescriptions.append(prescription)

        i += 1

    return prescriptions


def extract_text_from_pdf(path: str) -> str:  # pour extraire d'un pdf
    """Extrait tout le texte d'un PDF en concaténant les pages."""
    text = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text.append(page_text)
    return "\n".join(text)
