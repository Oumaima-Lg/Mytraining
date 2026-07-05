# PrepEntretien — plateforme de préparation aux entretiens

Full-stack rebuild of the Claude Design prototype.

## Stack
- **web/** — Next.js (App Router, TypeScript, Tailwind). BFF route handlers keep JWTs in httpOnly cookies.
- **api/** — Flask REST API + AI (transcription, scoring, Q&A generation).
- **PostgreSQL** — structured data (users, modules, questions, interviews, runs).
- **MinIO** — S3-compatible object storage for answer attachments + recordings.

## Quick start
```bash
cp .env.example .env        # then edit secrets + ANTHROPIC_API_KEY
docker compose up --build
```
Services:
- Web app → http://localhost:3000
- Flask API → http://localhost:5000 (health: `/health`)
- MinIO console → http://localhost:9001 (login: MINIO_ROOT_USER / MINIO_ROOT_PASSWORD)
- Postgres → localhost:5432

## Feature flows
1. **Home** — *Créer un module Q&A* / *Passer un entretien*.
2. **Module builder** — name (`java-qa`, `rh-qa`…), add question/answer pairs, attach images/PDFs/schemas.
3. **Interview config** — pick 2–3 modules, set timers, toggle audio/video/camera + hide-answers.
4. **Run** — timer + module names on top, question (answer hidden, revealable) left, camera right, *Suivant*.
5. **Results** — transcript + AI score + feedback per answer.

See `.claude/plans` for the full build plan.
