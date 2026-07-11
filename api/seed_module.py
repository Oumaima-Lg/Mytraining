"""Seed Q&A modules into the database — questions (Postgres) + images (MinIO).

Unified seeder: for each JSON file it creates the module, inserts its questions,
and uploads each question's images (schemas) to MinIO, registering Attachment
rows so the schemas show up under the answer in the app.

A module belongs to a user, so pass the email of the account you log in with —
the modules show up under that account. If the user doesn't exist yet, it is
created. Runs inside the api container (uses the app's DATABASE_URL and reaches
MinIO via the compose service name).

Usage (from the project root):
    # seed EVERY seed_data/*.json under one account
    docker compose exec api python seed_module.py you@example.com

    # or a single file / custom password
    docker compose exec api python seed_module.py you@example.com mypassword seed_data/java.json

Idempotent: re-running skips questions whose prompt already exists in the module
(so their images are not re-uploaded either).
"""
import glob
import io
import json
import mimetypes
import os
import sys
import uuid
from datetime import datetime

from app import create_app
from app.extensions import db
from app.models import User, Module, Question, Attachment
from app.modules.routes import _slugify
from app.storage import _client, ensure_bucket


def _upload_image(user_id: int, path: str) -> tuple[str, str, int]:
    """Upload one file to MinIO; return (key, content_type, size)."""
    with open(path, "rb") as f:
        data = f.read()
    filename = os.path.basename(path)
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    stamp = datetime.utcnow().strftime("%Y%m%d")
    key = f"attachments/u{user_id}/{stamp}/{uuid.uuid4().hex}-{filename}"
    client = _client()
    bucket = os.environ.get("MINIO_BUCKET") or "prep-entretien"
    client.put_object(
        bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
    )
    return key, content_type, len(data)


def seed_file(app, user: User, json_path: str) -> tuple[int, int]:
    """Seed one JSON file. Returns (questions_added, images_added)."""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    media_dir = data.get("media_dir")

    print(f"\n=== {os.path.basename(json_path)} → module '{data['module']}' ===")

    module = Module.query.filter_by(user_id=user.id, name=data["module"]).first()
    if module is None:
        module = Module(
            user_id=user.id,
            name=data["module"],
            slug=_slugify(data["module"]),
            description=data.get("description", ""),
        )
        db.session.add(module)
        db.session.flush()
        print(f"  → Created module '{module.name}'")
    else:
        print(f"  → Using existing module '{module.name}'")

    existing = {q.prompt for q in module.questions}
    base = len(module.questions)
    added = 0
    imgs = 0
    for q in data["questions"]:
        if q["prompt"] in existing:
            continue
        question = Question(
            module_id=module.id,
            prompt=q["prompt"],
            answer_text=q.get("answer_text", ""),
            order_index=base + added,
        )
        db.session.add(question)
        db.session.flush()  # get question.id

        image_names = q.get("images", [])
        for name in image_names:
            if not media_dir:
                print(f"    ! '{data['module']}' has images but no media_dir; skipping {name}")
                continue
            path = os.path.join(media_dir, name)
            if not os.path.exists(path):
                print(f"    ! missing image {path}")
                continue
            with app.test_request_context():
                key, ctype, size = _upload_image(user.id, path)
            db.session.add(Attachment(
                question_id=question.id,
                filename=name,
                minio_key=key,
                content_type=ctype,
                size=size,
            ))
            imgs += 1
        added += 1

    db.session.commit()
    total = len(Module.query.get(module.id).questions)
    print(f"  ✓ +{added} question(s), +{imgs} image(s). Module now has {total} question(s).")
    return added, imgs


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python seed_module.py <email> [password] [json_path]")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    password = sys.argv[2] if len(sys.argv) > 2 else "changeme123"
    path = sys.argv[3] if len(sys.argv) > 3 else None

    if path:
        files = [path]
    else:
        files = sorted(glob.glob(os.path.join("seed_data", "*.json")))
    if not files:
        print("✗ No JSON files to seed.")
        sys.exit(1)

    app = create_app()
    with app.app_context():
        user = User.query.filter_by(email=email).first()
        if user is None:
            user = User(email=email, name=email.split("@")[0])
            user.set_password(password)
            db.session.add(user)
            db.session.flush()
            print(f"→ Created user '{email}' (password: {password})")
        else:
            print(f"→ Using existing user '{email}'")

        with app.test_request_context():
            ensure_bucket()

        total_q = 0
        total_i = 0
        for json_path in files:
            added, imgs = seed_file(app, user, json_path)
            total_q += added
            total_i += imgs

        print(f"\n✓ Done: {len(files)} file(s), +{total_q} question(s), +{total_i} image(s) for '{email}'.")


if __name__ == "__main__":
    main()
