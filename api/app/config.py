import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://prep:prep_password@localhost:5432/prep_entretien",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_TOKEN_MINUTES", "30"))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_DAYS", "30"))
    )

    # CORS
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

    # MinIO
    MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
    MINIO_PUBLIC_ENDPOINT = os.environ.get("MINIO_PUBLIC_ENDPOINT", "localhost:9000")
    MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
    MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
    MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "prep-entretien")
    MINIO_SECURE = os.environ.get("MINIO_SECURE", "false").lower() == "true"

    # AI
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    ANTHROPIC_GENERATE_MODEL = os.environ.get(
        "ANTHROPIC_GENERATE_MODEL", "claude-sonnet-4-6"
    )
    ANTHROPIC_SCORE_MODEL = os.environ.get("ANTHROPIC_SCORE_MODEL", "claude-opus-4-8")
    WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
