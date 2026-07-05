"""Auth endpoints: register, login, refresh, me.

Flask is the auth authority. It issues short-lived access tokens and long-lived
refresh tokens (flask-jwt-extended). The Next.js BFF stores them in httpOnly
cookies and attaches the access token as a Bearer header when proxying.
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)

from ..extensions import db
from ..models import User
from ..common import current_user

bp = Blueprint("auth", __name__)


def _tokens(user: User) -> dict:
    identity = str(user.id)
    return {
        "access_token": create_access_token(identity=identity),
        "refresh_token": create_refresh_token(identity=identity),
        "user": user.to_dict(),
    }


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email or not password or not name:
        return jsonify(error="Nom, email et mot de passe sont requis"), 400
    if len(password) < 8:
        return jsonify(error="Le mot de passe doit contenir au moins 8 caractères"), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="Cet email est déjà utilisé"), 409

    user = User(email=email, name=name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(_tokens(user)), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if user is None or not user.check_password(password):
        return jsonify(error="Identifiants invalides"), 401
    return jsonify(_tokens(user)), 200


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    return jsonify(access_token=create_access_token(identity=identity)), 200


@bp.get("/me")
def me():
    return jsonify(user=current_user().to_dict()), 200
