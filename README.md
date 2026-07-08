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
docker compose up --build   # add -d to run detached
```
Services:
- Web app → http://localhost:3000
- Flask API → http://localhost:5000 (health: `/health`)
- MinIO console → http://localhost:9001 (login: MINIO_ROOT_USER / MINIO_ROOT_PASSWORD)
- Postgres → localhost:5432 (user/pass/db from `.env`: `prep` / `prep_password` / `prep_entretien`)

Everyday commands:
```bash
docker compose up -d        # start (data is kept between runs)
docker compose stop         # stop containers, keep data
docker compose down         # remove containers, keep data (volumes survive)
docker compose logs -f api  # tail a service
```

## Data persistence
Postgres and MinIO write to **named Docker volumes** declared in `docker-compose.yml`
(`pgdata` → `/var/lib/postgresql/data`, `miniodata` → `/data`). The data lives in the
volume, not in the container, so it **survives** `restart`, `stop/start`, `down`, and
`up --build`.

⚠️ The data is **destroyed** only by `docker compose down -v` or by deleting the
volume (`docker volume rm mytraining_pgdata`). The volumes are **local to this machine**
and are *not* in git — cloning the repo elsewhere gives you empty databases (see **Backup & restore** below).

## Seed the Java Q&A module
The 47-question `java-qa` module ships as JSON in the repo and is loaded with:
```bash
docker compose exec api python seed_module.py you@example.com
# optional: python seed_module.py you@example.com <password> seed_data/java_qa.json
```
The module is created under that account (the user is created if missing). Idempotent —
re-running only adds prompts that don't already exist.

## Inspect the database (DBeaver / psql)
- **DBeaver → New Connection → PostgreSQL:** host `localhost`, port `5432`,
  database `prep_entretien`, user `prep`, password `prep_password`.
  (Use `localhost`, not the `postgres` hostname from `DATABASE_URL` — that name only
  resolves inside the Docker network.)
- **psql:** `docker compose exec postgres psql -U prep -d prep_entretien`

## Backup & restore / move to another machine
Volumes stay on the machine that created them, so to carry your data to another PC you
export it, copy the files, and import.

**Export (on the source machine):**
```bash
mkdir -p backup
# Postgres — logical dump (portable, preferred)
docker compose exec -T postgres pg_dump -U prep -d prep_entretien > backup/postgres.sql
# MinIO — object store has no dump tool, so copy the volume
docker run --rm -v mytraining_miniodata:/data -v "$PWD/backup":/backup \
  alpine tar czf /backup/minio.tar.gz -C /data .
```

**Move to another machine**
```bash
git clone <repo> && cd Mytraining      # folder MUST be "Mytraining" so volume names match
cp /path/to/.env .env                  # bring your .env (secrets) — it is git-ignored
# copy the backup/ folder here too, then:

docker compose up -d                   # creates empty volumes + runs migrations

# restore Postgres into the fresh DB
docker compose exec -T postgres psql -U prep -d prep_entretien < backup/postgres.sql
# restore MinIO objects
docker run --rm -v mytraining_miniodata:/data -v "$PWD/backup":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/minio.tar.gz -C /data"
docker compose restart minio
```
Notes:
- The `.env` and `backup/` folder are git-ignored (contain secrets/data) — copy them
  by hand (USB, scp, cloud drive).
- Volume names are prefixed with the project folder name (`mytraining_`), so clone into
  a folder named **`Mytraining`**, or set `COMPOSE_PROJECT_NAME=mytraining` in `.env`.
- Restore into a **fresh** DB (right after the first `up`) to avoid primary-key clashes.
  To reset: `docker compose down -v && docker compose up -d`.

## Feature flows
1. **Home** — *Créer un module Q&A* / *Passer un entretien*.
2. **Module builder** — name (`java-qa`, `rh-qa`…), add question/answer pairs, attach images/PDFs/schemas.
3. **Interview config** — pick 2–3 modules, set timers, toggle audio/video/camera + hide-answers.
4. **Run** — timer + module names on top, question (answer hidden, revealable) left, camera right, *Suivant*.
5. **Results** — transcript + AI score + feedback per answer.

See `.claude/plans` for the full build plan.
