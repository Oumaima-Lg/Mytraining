"""AI helpers: transcription (faster-whisper) + Claude scoring/generation.

Claude does not do speech-to-text, so transcription runs locally via
faster-whisper. Scoring and question generation use the Anthropic SDK with
structured outputs so we get back parseable JSON.
"""
import json
import os
import tempfile

import anthropic
from flask import current_app

# faster-whisper model is heavy; load lazily and cache on the module.
_whisper_model = None


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=current_app.config["ANTHROPIC_API_KEY"])


# ── Transcription ───────────────────────────────────────────────────
def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    global _whisper_model
    from faster_whisper import WhisperModel

    if _whisper_model is None:
        _whisper_model = WhisperModel(
            current_app.config["WHISPER_MODEL"], device="cpu", compute_type="int8"
        )

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = _whisper_model.transcribe(tmp_path, beam_size=5)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        os.unlink(tmp_path)


# ── Scoring ─────────────────────────────────────────────────────────
_SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "gaps": {"type": "array", "items": {"type": "string"}},
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["score", "strengths", "gaps", "suggestions"],
    "additionalProperties": False,
}


def score_answer(question: str, model_answer: str, candidate_transcript: str) -> dict:
    """Compare the candidate's spoken answer to the model answer → score 0-100 + feedback."""
    prompt = (
        "Tu es un évaluateur d'entretien technique bienveillant mais exigeant. "
        "Compare la réponse du candidat à la réponse modèle et attribue une note de 0 à 100. "
        "Réponds en français.\n\n"
        f"QUESTION:\n{question}\n\n"
        f"RÉPONSE MODÈLE:\n{model_answer or '(aucune réponse modèle fournie)'}\n\n"
        f"RÉPONSE DU CANDIDAT (transcription):\n{candidate_transcript or '(vide)'}"
    )
    resp = _client().messages.create(
        model=current_app.config["ANTHROPIC_SCORE_MODEL"],
        max_tokens=2000,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": _SCORE_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(text)
    data["score"] = max(0, min(100, int(data["score"])))
    return data


# ── Question generation ─────────────────────────────────────────────
_GENERATE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "answer_text": {"type": "string"},
                },
                "required": ["prompt", "answer_text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}


def generate_questions(topic: str, count: int = 5) -> list:
    """Generate `count` interview Q&A pairs about a topic or job description."""
    prompt = (
        f"Génère {count} questions d'entretien (avec des réponses modèles claires et concises) "
        f"en français sur le sujet suivant:\n\n{topic}"
    )
    resp = _client().messages.create(
        model=current_app.config["ANTHROPIC_GENERATE_MODEL"],
        max_tokens=4000,
        output_config={"format": {"type": "json_schema", "schema": _GENERATE_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text)["questions"]
