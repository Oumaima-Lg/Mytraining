"""SQLAlchemy models for PrepEntretien.

Data model:
  User 1─* Module 1─* Question 1─* Attachment
  User 1─* Interview *─* Module   (via interview_modules)
  Interview 1─* InterviewRun 1─* AnswerRecording
"""
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

from .extensions import db


# ── Association: an interview references 2–3 modules ─────────────────
interview_modules = db.Table(
    "interview_modules",
    db.Column("interview_id", db.Integer, db.ForeignKey("interviews.id", ondelete="CASCADE"), primary_key=True),
    db.Column("module_id", db.Integer, db.ForeignKey("modules.id", ondelete="CASCADE"), primary_key=True),
)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    modules = db.relationship("Module", backref="user", cascade="all, delete-orphan", lazy="dynamic")
    interviews = db.relationship("Interview", backref="user", cascade="all, delete-orphan", lazy="dynamic")

    def set_password(self, raw: str) -> None:
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        return check_password_hash(self.password_hash, raw)

    def to_dict(self) -> dict:
        return {"id": self.id, "email": self.email, "name": self.name}


class Module(db.Model):
    __tablename__ = "modules"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    questions = db.relationship(
        "Question", backref="module", cascade="all, delete-orphan",
        order_by="Question.order_index", lazy="selectin",
    )

    def to_dict(self, with_questions: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "question_count": len(self.questions),
            "created_at": self.created_at.isoformat(),
        }
        if with_questions:
            data["questions"] = [q.to_dict() for q in self.questions]
        return data


class Question(db.Model):
    __tablename__ = "questions"

    id = db.Column(db.Integer, primary_key=True)
    module_id = db.Column(db.Integer, db.ForeignKey("modules.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = db.Column(db.Text, nullable=False)
    answer_text = db.Column(db.Text, default="")
    order_index = db.Column(db.Integer, default=0, nullable=False)

    attachments = db.relationship(
        "Attachment", backref="question", cascade="all, delete-orphan", lazy="selectin",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "module_id": self.module_id,
            "prompt": self.prompt,
            "answer_text": self.answer_text,
            "order_index": self.order_index,
            "attachments": [a.to_dict() for a in self.attachments],
        }


class Attachment(db.Model):
    __tablename__ = "attachments"

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    minio_key = db.Column(db.String(512), nullable=False)
    content_type = db.Column(db.String(120), default="application/octet-stream")
    size = db.Column(db.BigInteger, default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "minio_key": self.minio_key,
            "content_type": self.content_type,
            "size": self.size,
        }


class Interview(db.Model):
    __tablename__ = "interviews"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    total_time_sec = db.Column(db.Integer, default=0)
    per_question_time_sec = db.Column(db.Integer, default=0)
    per_module_time_sec = db.Column(db.Integer, default=0)
    record_audio = db.Column(db.Boolean, default=False)
    record_video = db.Column(db.Boolean, default=False)
    show_camera = db.Column(db.Boolean, default=True)
    hide_answers = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    modules = db.relationship("Module", secondary=interview_modules, lazy="selectin")
    runs = db.relationship("InterviewRun", backref="interview", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self, with_modules: bool = True) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "total_time_sec": self.total_time_sec,
            "per_question_time_sec": self.per_question_time_sec,
            "per_module_time_sec": self.per_module_time_sec,
            "record_audio": self.record_audio,
            "record_video": self.record_video,
            "show_camera": self.show_camera,
            "hide_answers": self.hide_answers,
            "created_at": self.created_at.isoformat(),
        }
        if with_modules:
            data["modules"] = [m.to_dict() for m in self.modules]
        return data


class InterviewRun(db.Model):
    __tablename__ = "interview_runs"

    id = db.Column(db.Integer, primary_key=True)
    interview_id = db.Column(db.Integer, db.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    finished_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default="in_progress")  # in_progress | finished

    recordings = db.relationship("AnswerRecording", backref="run", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "interview_id": self.interview_id,
            "status": self.status,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "recordings": [r.to_dict() for r in self.recordings],
        }


class AnswerRecording(db.Model):
    __tablename__ = "answer_recordings"

    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey("interview_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = db.Column(db.Integer, db.ForeignKey("questions.id", ondelete="SET NULL"), nullable=True)
    minio_key = db.Column(db.String(512), nullable=True)
    media_type = db.Column(db.String(10), default="video")  # audio | video
    transcript = db.Column(db.Text, nullable=True)
    ai_score = db.Column(db.Integer, nullable=True)
    ai_feedback = db.Column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "run_id": self.run_id,
            "question_id": self.question_id,
            "minio_key": self.minio_key,
            "media_type": self.media_type,
            "transcript": self.transcript,
            "ai_score": self.ai_score,
            "ai_feedback": self.ai_feedback,
        }
