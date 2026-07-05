"""Interview configuration + run lifecycle."""
from datetime import datetime

from flask import Blueprint, jsonify, request, abort

from ..extensions import db
from ..models import Interview, Module, InterviewRun, AnswerRecording, Question
from ..common import current_user, owned_or_404

bp = Blueprint("interviews", __name__)


def _get_interview(interview_id: int, user_id: int) -> Interview:
    return owned_or_404(Interview.query.get(interview_id), user_id)


def _get_run(run_id: int, user_id: int) -> InterviewRun:
    return owned_or_404(InterviewRun.query.get(run_id), user_id)


def _ordered_questions(interview: Interview) -> list:
    """Flatten questions of the selected modules, grouped by module order."""
    items = []
    for module in interview.modules:
        for q in module.questions:
            data = q.to_dict()
            data["module_name"] = module.name
            items.append(data)
    return items


# ── Config ──────────────────────────────────────────────────────────
@bp.get("")
def list_interviews():
    user = current_user()
    rows = Interview.query.filter_by(user_id=user.id).order_by(Interview.created_at.desc()).all()
    return jsonify(interviews=[i.to_dict() for i in rows])


@bp.post("")
def create_interview():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    module_ids = data.get("module_ids") or []

    if not name:
        return jsonify(error="Le nom de l'entretien est requis"), 400
    if not (2 <= len(module_ids) <= 3):
        return jsonify(error="Choisissez entre 2 et 3 modules"), 400

    modules = Module.query.filter(
        Module.id.in_(module_ids), Module.user_id == user.id
    ).all()
    if len(modules) != len(set(module_ids)):
        return jsonify(error="Un ou plusieurs modules sont invalides"), 400

    interview = Interview(
        user_id=user.id,
        name=name,
        total_time_sec=int(data.get("total_time_sec", 0)),
        per_question_time_sec=int(data.get("per_question_time_sec", 0)),
        per_module_time_sec=int(data.get("per_module_time_sec", 0)),
        record_audio=bool(data.get("record_audio", False)),
        record_video=bool(data.get("record_video", False)),
        show_camera=bool(data.get("show_camera", True)),
        hide_answers=bool(data.get("hide_answers", True)),
    )
    interview.modules = modules
    db.session.add(interview)
    db.session.commit()
    return jsonify(interview=interview.to_dict()), 201


@bp.get("/<int:interview_id>")
def get_interview(interview_id):
    user = current_user()
    interview = _get_interview(interview_id, user.id)
    data = interview.to_dict()
    data["questions"] = _ordered_questions(interview)
    return jsonify(interview=data)


@bp.delete("/<int:interview_id>")
def delete_interview(interview_id):
    user = current_user()
    interview = _get_interview(interview_id, user.id)
    db.session.delete(interview)
    db.session.commit()
    return jsonify(ok=True)


# ── Runs ────────────────────────────────────────────────────────────
@bp.post("/<int:interview_id>/runs")
def start_run(interview_id):
    user = current_user()
    interview = _get_interview(interview_id, user.id)
    run = InterviewRun(interview_id=interview.id, user_id=user.id, status="in_progress")
    db.session.add(run)
    db.session.commit()
    return jsonify(
        run=run.to_dict(),
        interview=interview.to_dict(),
        questions=_ordered_questions(interview),
    ), 201


@bp.get("/runs/<int:run_id>")
def get_run(run_id):
    user = current_user()
    run = _get_run(run_id, user.id)
    interview = _get_interview(run.interview_id, user.id)
    data = run.to_dict()
    data["interview"] = interview.to_dict()
    data["questions"] = _ordered_questions(interview)
    return jsonify(run=data)


@bp.post("/runs/<int:run_id>/recordings")
def add_recording(run_id):
    user = current_user()
    run = _get_run(run_id, user.id)
    data = request.get_json(silent=True) or {}
    question_id = data.get("question_id")

    # A recording row is created per answered question (even without media,
    # so text-only answers can still be transcribed/scored later).
    rec = AnswerRecording(
        run_id=run.id,
        question_id=question_id,
        minio_key=data.get("minio_key"),
        media_type=data.get("media_type", "video"),
    )
    db.session.add(rec)
    db.session.commit()
    return jsonify(recording=rec.to_dict()), 201


@bp.post("/runs/<int:run_id>/finish")
def finish_run(run_id):
    user = current_user()
    run = _get_run(run_id, user.id)
    run.status = "finished"
    run.finished_at = datetime.utcnow()
    db.session.commit()
    return jsonify(run=run.to_dict())
