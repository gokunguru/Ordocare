from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from .models import AppUser


class CustomJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        """
        Extract user_id from token and get AppUser instance
        """
        try:
            user_id = validated_token.get("user_id")
            if user_id is None:
                raise InvalidToken("Token contains no user_id")

            user = AppUser.objects.get(id=user_id)
            if not user.is_active:
                raise InvalidToken("User account is disabled")
            return user
        except AppUser.DoesNotExist:
            raise InvalidToken("User not found")
