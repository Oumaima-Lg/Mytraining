"""Interview configuration + run lifecycle."""
import random
from datetime import datetime

from flask import Blueprint, jsonify, request, abort

from ..extensions import db
from ..models import Interview, Module, InterviewRun, AnswerRecording, Question
from ..common import current_user, owned_or_404
from ..storage import remove_object

bp = Blueprint("interviews", __name__)


def _get_interview(interview_id: int, user_id: int) -> Interview:
    return owned_or_404(Interview.query.get(interview_id), user_id)


def _get_run(run_id: int, user_id: int) -> InterviewRun:
    return owned_or_404(InterviewRun.query.get(run_id), user_id)


def _ordered_questions(interview: Interview) -> list:
    """Flatten questions of the selected modules, shuffled (mixed, not in order)."""
    items = []
    for module in interview.modules:
        for q in module.questions:
            data = q.to_dict()
            data["module_name"] = module.name
            items.append(data)
    random.shuffle(items)
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
    if not (1 <= len(module_ids) <= 3):
        return jsonify(error="Choisissez entre 1 et 3 modules"), 400

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


@bp.get("/runs")
def list_runs():
    """History: all of the user's interview runs, newest first, with a score summary."""
    user = current_user()
    runs = (
        InterviewRun.query.filter_by(user_id=user.id)
        .order_by(InterviewRun.started_at.desc())
        .all()
    )
    out = []
    for run in runs:
        scores = [r.ai_score for r in run.recordings if r.ai_score is not None]
        out.append({
            "id": run.id,
            "interview_id": run.interview_id,
            "interview_name": run.interview.name if run.interview else "Entretien supprimé",
            "modules": [m.name for m in run.interview.modules] if run.interview else [],
            "status": run.status,
            "started_at": run.started_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "recording_count": len(run.recordings),
            "scored_count": len(scores),
            "avg_score": round(sum(scores) / len(scores)) if scores else None,
        })
    return jsonify(runs=out)


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


@bp.delete("/runs/<int:run_id>")
def delete_run(run_id):
    """Delete a history entry: the run, its recordings, and their MinIO videos."""
    user = current_user()
    run = _get_run(run_id, user.id)

    # Remove the recorded media from MinIO first (best-effort — a missing
    # object shouldn't block deleting the DB rows).
    for rec in run.recordings:
        if rec.minio_key:
            try:
                remove_object(rec.minio_key)
            except Exception:
                pass

    db.session.delete(run)  # cascades to AnswerRecording rows
    db.session.commit()
    return jsonify(ok=True)
