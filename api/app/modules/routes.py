"""Module + question CRUD. Every row is scoped to the authenticated user."""
import re

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Module, Question, Attachment
from ..common import current_user, owned_or_404

bp = Blueprint("modules", __name__)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "module"


def _get_module(module_id: int, user_id: int) -> Module:
    return owned_or_404(Module.query.get(module_id), user_id)


# ── Modules ─────────────────────────────────────────────────────────
@bp.get("")
def list_modules():
    user = current_user()
    q = request.args.get("q", "").strip().lower()
    query = Module.query.filter_by(user_id=user.id)
    if q:
        query = query.filter(Module.name.ilike(f"%{q}%"))
    modules = query.order_by(Module.created_at.desc()).all()
    return jsonify(modules=[m.to_dict() for m in modules])


@bp.post("")
def create_module():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="Le nom du module est requis"), 400

    module = Module(
        user_id=user.id,
        name=name,
        slug=_slugify(name),
        description=(data.get("description") or "").strip(),
    )
    db.session.add(module)
    db.session.flush()

    # Optionally accept inline questions on creation.
    for i, q in enumerate(data.get("questions") or []):
        if not (q.get("prompt") or "").strip():
            continue
        db.session.add(Question(
            module_id=module.id,
            prompt=q["prompt"].strip(),
            answer_text=(q.get("answer_text") or "").strip(),
            order_index=i,
        ))
    db.session.commit()
    return jsonify(module=module.to_dict(with_questions=True)), 201


@bp.get("/<int:module_id>")
def get_module(module_id):
    user = current_user()
    module = _get_module(module_id, user.id)
    return jsonify(module=module.to_dict(with_questions=True))


@bp.patch("/<int:module_id>")
def update_module(module_id):
    user = current_user()
    module = _get_module(module_id, user.id)
    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"].strip():
        module.name = data["name"].strip()
        module.slug = _slugify(module.name)
    if "description" in data:
        module.description = (data["description"] or "").strip()
    db.session.commit()
    return jsonify(module=module.to_dict())


@bp.delete("/<int:module_id>")
def delete_module(module_id):
    user = current_user()
    module = _get_module(module_id, user.id)
    db.session.delete(module)
    db.session.commit()
    return jsonify(ok=True)


# ── Questions ───────────────────────────────────────────────────────
@bp.post("/<int:module_id>/questions")
def add_question(module_id):
    user = current_user()
    module = _get_module(module_id, user.id)
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify(error="L'intitulé de la question est requis"), 400

    next_index = len(module.questions)
    question = Question(
        module_id=module.id,
        prompt=prompt,
        answer_text=(data.get("answer_text") or "").strip(),
        order_index=next_index,
    )
    db.session.add(question)
    db.session.commit()
    return jsonify(question=question.to_dict()), 201


def _get_question(module_id: int, question_id: int, user_id: int) -> Question:
    module = _get_module(module_id, user_id)
    question = Question.query.get(question_id)
    if question is None or question.module_id != module.id:
        from flask import abort
        abort(404, description="Question introuvable")
    return question


@bp.patch("/<int:module_id>/questions/<int:question_id>")
def update_question(module_id, question_id):
    user = current_user()
    question = _get_question(module_id, question_id, user.id)
    data = request.get_json(silent=True) or {}
    if "prompt" in data and data["prompt"].strip():
        question.prompt = data["prompt"].strip()
    if "answer_text" in data:
        question.answer_text = (data["answer_text"] or "").strip()
    if "order_index" in data:
        question.order_index = int(data["order_index"])
    db.session.commit()
    return jsonify(question=question.to_dict())


@bp.delete("/<int:module_id>/questions/<int:question_id>")
def delete_question(module_id, question_id):
    user = current_user()
    question = _get_question(module_id, question_id, user.id)
    db.session.delete(question)
    db.session.commit()
    return jsonify(ok=True)


# ── Attachments (metadata; upload happens via /files presigned URL) ──
@bp.post("/<int:module_id>/questions/<int:question_id>/attachments")
def add_attachment(module_id, question_id):
    user = current_user()
    question = _get_question(module_id, question_id, user.id)
    data = request.get_json(silent=True) or {}
    required = ("filename", "minio_key")
    if not all(data.get(k) for k in required):
        return jsonify(error="filename et minio_key sont requis"), 400
    att = Attachment(
        question_id=question.id,
        filename=data["filename"],
        minio_key=data["minio_key"],
        content_type=data.get("content_type", "application/octet-stream"),
        size=int(data.get("size", 0)),
    )
    db.session.add(att)
    db.session.commit()
    return jsonify(attachment=att.to_dict()), 201


@bp.delete("/<int:module_id>/questions/<int:question_id>/attachments/<int:attachment_id>")
def delete_attachment(module_id, question_id, attachment_id):
    user = current_user()
    question = _get_question(module_id, question_id, user.id)
    att = Attachment.query.get(attachment_id)
    if att is None or att.question_id != question.id:
        return jsonify(error="Pièce jointe introuvable"), 404
    db.session.delete(att)
    db.session.commit()
    return jsonify(ok=True)
