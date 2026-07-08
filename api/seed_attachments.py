"""Seed extra Q&A into a module, including image attachments (schemas).

Unlike seed_module.py (prompt + answer only), this also uploads each question's
images to MinIO and registers Attachment rows, so the schemas show up under the
answer in the app. Runs inside the api container (reaches MinIO via the compose
service name and uses the app's DATABASE_URL).

Usage (from the project root):
    docker compose exec api python seed_attachments.py you@example.com
    docker compose exec api python seed_attachments.py you@example.com seed_data/java_qa_additional.json

Idempotent: skips questions whose prompt already exists in the module.
"""
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


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python seed_attachments.py <email> [json_path]")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    json_path = sys.argv[2] if len(sys.argv) > 2 else "seed_data/java_qa_additional.json"

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    media_dir = data.get("media_dir", "seed_data/java_qa_media")

    app = create_app()
    with app.app_context():
        user = User.query.filter_by(email=email).first()
        if user is None:
            print(f"✗ No user '{email}'. Create the account (or seed the base module) first.")
            sys.exit(1)

        module = Module.query.filter_by(user_id=user.id, name=data["module"]).first()
        if module is None:
            print(f"✗ Module '{data['module']}' not found for '{email}'.")
            sys.exit(1)

        with app.test_request_context():
            ensure_bucket()

        existing = {q.prompt for q in module.questions}
        base = len(module.questions)
        added = 0
        imgs = 0
        for q in data["questions"]:
            if q["prompt"] in existing:
                print(f"  · skip (exists): {q['prompt'][:60]}")
                continue
            question = Question(
                module_id=module.id,
                prompt=q["prompt"],
                answer_text=q.get("answer_text", ""),
                order_index=base + added,
            )
            db.session.add(question)
            db.session.flush()  # get question.id

            for name in q.get("images", []):
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
            print(f"  + {q['prompt'][:60]}  ({len(q.get('images', []))} image(s))")

        db.session.commit()
        total = len(Module.query.get(module.id).questions)
        print(f"\n✓ Module '{module.name}': +{added} question(s), +{imgs} image(s). Now {total} question(s).")


if __name__ == "__main__":
    main()
