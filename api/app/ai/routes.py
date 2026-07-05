"""AI endpoints: generate questions, transcribe + score recorded answers."""
from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import AnswerRecording, InterviewRun, Question
from ..common import current_user, owned_or_404
from ..storage import download_bytes
from . import service

bp = Blueprint("ai", __name__)


@bp.post("/generate-questions")
def generate_questions():
    current_user()
    data = request.get_json(silent=True) or {}
    topic = (data.get("topic") or "").strip()
    if not topic:
        return jsonify(error="Le sujet (ou la description du poste) est requis"), 400
    count = max(1, min(15, int(data.get("count", 5))))
    try:
        questions = service.generate_questions(topic, count)
    except Exception as exc:  # surface AI/config errors to the client
        return jsonify(error=f"Échec de génération: {exc}"), 502
    return jsonify(questions=questions)


def _evaluate_recording(rec: AnswerRecording) -> None:
    """Transcribe (if media present) then score against the question's model answer."""
    question = Question.query.get(rec.question_id) if rec.question_id else None
    transcript = rec.transcript or ""

    if rec.minio_key and not transcript:
        audio = download_bytes(rec.minio_key)
        suffix = ".webm" if rec.media_type == "video" else ".webm"
        transcript = service.transcribe(audio, suffix=suffix)
        rec.transcript = transcript

    result = service.score_answer(
        question.prompt if question else "",
        question.answer_text if question else "",
        transcript,
    )
    rec.ai_score = result["score"]
    rec.ai_feedback = "\n".join(
        ["Points forts:"] + [f"- {s}" for s in result["strengths"]]
        + ["", "Lacunes:"] + [f"- {g}" for g in result["gaps"]]
        + ["", "Suggestions:"] + [f"- {s}" for s in result["suggestions"]]
    )


@bp.post("/recordings/<int:recording_id>/evaluate")
def evaluate_recording(recording_id):
    user = current_user()
    rec = AnswerRecording.query.get(recording_id)
    if rec is None:
        return jsonify(error="Enregistrement introuvable"), 404
    owned_or_404(InterviewRun.query.get(rec.run_id), user.id)
    try:
        _evaluate_recording(rec)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify(error=f"Échec de l'évaluation: {exc}"), 502
    return jsonify(recording=rec.to_dict())


@bp.post("/runs/<int:run_id>/evaluate")
def evaluate_run(run_id):
    user = current_user()
    run = owned_or_404(InterviewRun.query.get(run_id), user.id)
    errors = []
    for rec in run.recordings:
        try:
            _evaluate_recording(rec)
        except Exception as exc:  # keep going; report per-recording failures
            errors.append({"recording_id": rec.id, "error": str(exc)})
    db.session.commit()
    return jsonify(run=run.to_dict(), errors=errors)
