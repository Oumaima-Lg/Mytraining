"""Shared request helpers: current-user lookup and ownership guards."""
from functools import wraps

from flask import abort
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .models import User


def current_user() -> User:
    """Return the authenticated User or abort 401."""
    verify_jwt_in_request()
    user = User.query.get(int(get_jwt_identity()))
    if user is None:
        abort(401, description="Utilisateur introuvable")
    return user


def owned_or_404(query_result, user_id: int):
    """Ensure a row exists and belongs to the user, else 404 (avoids leaking existence)."""
    if query_result is None or query_result.user_id != user_id:
        abort(404, description="Ressource introuvable")
    return query_result


def with_user(fn):
    """Decorator that injects the current user as first arg."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(current_user(), *args, **kwargs)
    return wrapper
