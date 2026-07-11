"""Thin MinIO wrapper: bucket bootstrap + presigned URL issuance.

Presigned URLs let the browser upload/download directly to MinIO without the
API ever proxying file bytes or exposing storage credentials. Internally the
API talks to MINIO_ENDPOINT (compose service); presigned URLs are rewritten to
MINIO_PUBLIC_ENDPOINT so a browser on the host can reach them.
"""
from datetime import timedelta

from flask import current_app
from minio import Minio


def _client(public: bool = False) -> Minio:
    cfg = current_app.config
    endpoint = cfg["MINIO_PUBLIC_ENDPOINT"] if public else cfg["MINIO_ENDPOINT"]
    return Minio(
        endpoint,
        access_key=cfg["MINIO_ROOT_USER"],
        secret_key=cfg["MINIO_ROOT_PASSWORD"],
        secure=cfg["MINIO_SECURE"],
        # Pin the region so presigning never does a live "get bucket region"
        # call. The public endpoint (localhost:9000) isn't reachable from inside
        # the api container, so that lookup would fail — but presigning itself
        # needs no network access once the region is known.
        region=cfg.get("MINIO_REGION", "us-east-1"),
    )


def ensure_bucket() -> None:
    client = _client()
    bucket = current_app.config["MINIO_BUCKET"]
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def presigned_put(object_key: str, expires_seconds: int = 3600) -> str:
    """URL the browser PUTs file bytes to."""
    return _client(public=True).presigned_put_object(
        current_app.config["MINIO_BUCKET"],
        object_key,
        expires=timedelta(seconds=expires_seconds),
    )


def presigned_get(object_key: str, expires_seconds: int = 3600) -> str:
    """URL the browser GETs file bytes from."""
    return _client(public=True).presigned_get_object(
        current_app.config["MINIO_BUCKET"],
        object_key,
        expires=timedelta(seconds=expires_seconds),
    )


def remove_object(object_key: str) -> None:
    """Delete one object from the bucket (best-effort)."""
    client = _client()
    client.remove_object(current_app.config["MINIO_BUCKET"], object_key)


def download_bytes(object_key: str) -> bytes:
    """Server-side fetch (used by AI transcription)."""
    client = _client()
    resp = client.get_object(current_app.config["MINIO_BUCKET"], object_key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
