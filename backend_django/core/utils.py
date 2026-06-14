"""
Utilitaires métier — OrdoCare

Fonctions partagées entre les vues et services.
"""


def build_medicine_summary(prescriptions, default="Aucun médicament détecté"):
    """
    Construit un résumé textuel des médicaments à partir d'une liste de prescriptions.

    Exemples :
        - "Doliprane, Amoxicilline, Ibuprofène"
        - "Doliprane, Amoxicilline, Ibuprofène +2 autre(s)"
        - "Aucun médicament détecté" (si aucune prescription)
    """
    names = [p.medicine_name for p in prescriptions if p.medicine_name]
    summary = ", ".join(names[:3])
    if len(names) > 3:
        summary += f" +{len(names) - 3} autre(s)"
    return summary or default
