"""Presigned URL issuance so the browser talks to MinIO directly.

Flow:
  1. Client asks POST /files/presign-upload {filename, content_type, scope}
  2. API returns {key, url}; client PUTs the bytes to url.
  3. Client persists `key` on the owning record (attachment / recording).
  4. To display, client asks GET /files/presign-download?key=... for a GET url.
"""
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request

from ..common import current_user
from ..storage import presigned_put, presigned_get

bp = Blueprint("files", __name__)

# scope → object-key prefix
_SCOPES = {
    "attachment": "attachments",
    "recording": "recordings",
}


@bp.post("/presign-upload")
def presign_upload():
    user = current_user()
    data = request.get_json(silent=True) or {}
    filename = (data.get("filename") or "file").replace("/", "_")
    scope = data.get("scope", "attachment")
    prefix = _SCOPES.get(scope, "misc")

    stamp = datetime.utcnow().strftime("%Y%m%d")
    key = f"{prefix}/u{user.id}/{stamp}/{uuid.uuid4().hex}-{filename}"
    url = presigned_put(key)
    return jsonify(key=key, url=url)


@bp.get("/presign-download")
def presign_download():
    current_user()  # auth gate
    key = request.args.get("key")
    if not key:
        return jsonify(error="key requis"), 400
    return jsonify(url=presigned_get(key))
