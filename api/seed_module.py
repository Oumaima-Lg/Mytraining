"""Seed a Q&A module into the database from a JSON file.

Runs inside the api container (it uses the app's DATABASE_URL). A module belongs
to a user, so pass the email of the account you log in with — the module will
show up under that account. If the user doesn't exist yet, it is created.

Usage (from the project root):
    docker compose exec api python seed_module.py you@example.com
    docker compose exec api python seed_module.py you@example.com mypassword seed_data/java_qa.json

Idempotent: re-running skips questions whose prompt already exists in the module.
"""
import json
import sys

from app import create_app
from app.extensions import db
from app.models import User, Module, Question
from app.modules.routes import _slugify


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python seed_module.py <email> [password] [json_path]")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    password = sys.argv[2] if len(sys.argv) > 2 else "changeme123"
    json_path = sys.argv[3] if len(sys.argv) > 3 else "seed_data/java_qa.json"

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

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
            print(f"→ Created module '{module.name}'")
        else:
            print(f"→ Using existing module '{module.name}'")

        existing = {q.prompt for q in module.questions}
        base = len(module.questions)
        added = 0
        for q in data["questions"]:
            if q["prompt"] in existing:
                continue
            db.session.add(
                Question(
                    module_id=module.id,
                    prompt=q["prompt"],
                    answer_text=q.get("answer_text", ""),
                    order_index=base + added,
                )
            )
            added += 1

        db.session.commit()
        total = Module.query.get(module.id).questions
        print(f"✓ Module '{module.name}' now has {len(total)} question(s) (+{added} added).")


if __name__ == "__main__":
    main()
