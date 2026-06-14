"""
Permissions personnalisées — OrdoCare

Centralise les contrôles d'accès pour éviter la duplication
de la logique d'ownership dans chaque action de ViewSet.
"""

from rest_framework.permissions import BasePermission


class IsOwner(BasePermission):
    """
    Vérifie que l'utilisateur authentifié accède à ses propres données.

    Utilisé sur les actions de sous-ressources /users/{id}/...
    où `pk` dans l'URL doit correspondre à `request.user.id`.
    """

    message = "Accès interdit : vous ne pouvez consulter que vos propres données"

    def has_permission(self, request, view):
        pk = view.kwargs.get("pk")
        if pk is None:
            return False
        return request.user and request.user.is_authenticated and request.user.id == int(pk)
