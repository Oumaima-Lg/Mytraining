"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_modules_user_id", "modules", ["user_id"])

    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_questions_module_id", "questions", ["module_id"])

    op.create_table(
        "attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("minio_key", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("size", sa.BigInteger(), nullable=True),
    )
    op.create_index("ix_attachments_question_id", "attachments", ["question_id"])

    op.create_table(
        "interviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("total_time_sec", sa.Integer(), nullable=True),
        sa.Column("per_question_time_sec", sa.Integer(), nullable=True),
        sa.Column("per_module_time_sec", sa.Integer(), nullable=True),
        sa.Column("record_audio", sa.Boolean(), nullable=True),
        sa.Column("record_video", sa.Boolean(), nullable=True),
        sa.Column("show_camera", sa.Boolean(), nullable=True),
        sa.Column("hide_answers", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_interviews_user_id", "interviews", ["user_id"])

    op.create_table(
        "interview_modules",
        sa.Column("interview_id", sa.Integer(), sa.ForeignKey("interviews.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "interview_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("interview_id", sa.Integer(), sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
    )
    op.create_index("ix_interview_runs_interview_id", "interview_runs", ["interview_id"])
    op.create_index("ix_interview_runs_user_id", "interview_runs", ["user_id"])

    op.create_table(
        "answer_recordings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("interview_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("minio_key", sa.String(length=512), nullable=True),
        sa.Column("media_type", sa.String(length=10), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("ai_score", sa.Integer(), nullable=True),
        sa.Column("ai_feedback", sa.Text(), nullable=True),
    )
    op.create_index("ix_answer_recordings_run_id", "answer_recordings", ["run_id"])


def downgrade():
    op.drop_table("answer_recordings")
    op.drop_table("interview_runs")
    op.drop_table("interview_modules")
    op.drop_table("interviews")
    op.drop_table("attachments")
    op.drop_table("questions")
    op.drop_table("modules")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
