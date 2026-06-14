import re


# --- helpers ---
def _plural(n: int, singular: str, plural: str) -> str:
    return singular if n == 1 else plural


def _clean(s: str) -> str:
    if not s:
        return ""
    s = s.lower().strip()
    s = s.replace("×", "x")
    s = re.sub(r"\s+", " ", s)
    return s


# --- QUANTITE ---
def expand_quantite(q: str) -> str:
    """
    Ex: "1 cp" -> "1 comprimé"
        "2 gel" -> "2 gélules"
        "1 comprimé" -> "1 comprimé" (déjà OK)
    """
    q = _clean(q)
    if not q:
        return ""

    m = re.search(r"\b(\d+)\s*(cp|cps)\b", q)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'comprimé', 'comprimés')}"

    m = re.search(r"\b(\d+)\s*(gél|gél\.|gélule|gélules)\b", q)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'gélule', 'gélules')}"

    m = re.search(r"\b(\d+)\s*(gel|gels)\b", q)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'gel', 'gels')}"

    m = re.search(r"\b(\d+)\s*(sachet|sachets)\b", q)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'sachet', 'sachets')}"

    m = re.search(r"\b(\d+)\s*(ampoule|ampoules)\b", q)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'ampoule', 'ampoules')}"

    # fallback: on renvoie tel quel
    return q


# --- FREQUENCE ---
def expand_frequency(freq: str) -> str:
    """
    Ex: "3/j" -> "3 fois par jour"
        "x3/j" -> "3 fois par jour"
        "matin et soir" -> "le matin et le soir"
    """
    freq = _clean(freq)
    if not freq:
        return ""

    # déjà bon: "3 fois par jour"
    m = re.search(r"\b(\d+)\s*fois\s*par\s*jour\b", freq)
    if m:
        return f"{int(m.group(1))} fois par jour"

    # "3/j" ou "3/jour"
    m = re.search(r"\b(\d+)\s*/\s*j(?:our)?\b", freq)
    if m:
        return f"{int(m.group(1))} fois par jour"

    # "x3/j" ou "x 3 / j"
    m = re.search(r"\bx\s*(\d+)\s*/\s*j(?:our)?\b", freq)
    if m:
        return f"{int(m.group(1))} fois par jour"

    if "matin midi soir" in freq:
        return "le matin, le midi et le soir"
    if "matin et soir" in freq:
        return "le matin et le soir"

    # mots seuls
    if freq in {"matin", "midi", "soir", "nuit"}:
        return f"le {freq}" if freq != "nuit" else "la nuit"

    m = re.search(r"toutes\s+les\s+(\d+)\s+heures", freq)
    if m:
        return f"toutes les {int(m.group(1))} heures"

    return freq


# --- DUREE ---
def expand_duration(d: str) -> str:
    """
    Ex: "7 j" -> "7 jours"
        "2 sem" -> "2 semaines"
        "1 mois" -> "1 mois"
    """
    d = _clean(d)
    if not d:
        return ""

    m = re.search(r"\b(\d+)\s*(j|jour|jours)\b", d)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'jour', 'jours')}"

    m = re.search(r"\b(\d+)\s*(sem|semaine|semaines)\b", d)
    if m:
        n = int(m.group(1))
        return f"{n} {_plural(n, 'semaine', 'semaines')}"

    m = re.search(r"\b(\d+)\s*mois\b", d)
    if m:
        n = int(m.group(1))
        return f"{n} mois"

    return d


def expand_conditions(condition_si: str, condition: str) -> str:
    condition_si = _clean(condition_si)
    condition = _clean(condition)

    parts = []
    if condition_si:
        # garde "si ..." tel quel, juste clean
        parts.append(condition_si)
    if condition:
        # normalise accents éventuels "apres" -> "après" si tu veux plus tard
        parts.append(condition)

    return ", ".join([p for p in parts if p])


def build_sig_expanded(
    quantite: str,
    frequency: str,
    duration: str,
    condition_si: str = "",
    condition: str = "",
) -> str:
    qx = expand_quantite(quantite)
    fx = expand_frequency(frequency)
    dx = expand_duration(duration)
    cx = expand_conditions(condition_si, condition)

    chunks = []
    if qx:
        chunks.append(qx)
    if fx:
        chunks.append(fx)
    if dx:
        chunks.append(f"pendant {dx}")
    if cx:
        chunks.append(cx)

    return " ".join(chunks).strip()
