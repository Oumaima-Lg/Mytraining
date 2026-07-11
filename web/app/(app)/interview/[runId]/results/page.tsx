"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, presignDownload, Recording, Question } from "@/lib/api";

type RunData = {
  id: number;
  questions: Question[];
  recordings: Recording[];
};

export default function ResultsPage({
  params,
}: {
  params: { runId: string };
}) {
  const runId = params.runId;
  const [run, setRun] = useState<RunData | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const { run } = await api.get<{ run: RunData }>(
      `interviews/runs/${runId}`,
    );
    setRun(run);
  }
  useEffect(() => {
    load();
  }, []);

  async function evaluate() {
    setEvaluating(true);
    setError("");
    try {
      await api.post(`ai/runs/${runId}/evaluate`);
      // Re-load via the full run endpoint so questions stay populated
      // (the evaluate response omits them).
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEvaluating(false);
    }
  }

  if (!run) return <p className="text-gray-400 dark:text-slate-500">Chargement…</p>;

  const questionById = new Map(
    (run.questions ?? []).map((q) => [q.id, q]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Résultats de l&apos;entretien</h1>
        <Link href="/" className="btn-secondary">
          Accueil
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Lancez l&apos;évaluation IA pour transcrire vos réponses et obtenir un
          score et des conseils.
        </p>
        <button
          onClick={evaluate}
          className="btn-primary"
          disabled={evaluating}
        >
          {evaluating ? "Évaluation en cours…" : "Lancer l'évaluation IA"}
        </button>
      </div>

      {run.recordings.length === 0 ? (
        <div className="card text-gray-500 dark:text-slate-400">
          Aucune réponse enregistrée pour cet entretien.
        </div>
      ) : (
        <RecordingViewer
          recordings={run.recordings}
          questionById={questionById}
        />
      )}
    </div>
  );
}

/**
 * Single-question video viewer: watch one recorded answer at a time, step
 * through with prev/next (or ← / → keys), and go fullscreen — with the
 * navigation kept visible over the video so you can jump to the next question
 * without leaving fullscreen. Presigns every clip up front so switching is
 * instant, with a subtle enter animation.
 */
function RecordingViewer({
  recordings,
  questionById,
}: {
  recordings: Recording[];
  questionById: Map<number, Question>;
}) {
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const count = recordings.length;
  const rec = recordings[i];
  const q = rec?.question_id ? questionById.get(rec.question_id) : undefined;
  const url = rec ? urls[rec.id] : undefined;

  // Presign all clips once so navigation doesn't reload/flicker.
  useEffect(() => {
    let alive = true;
    Promise.all(
      recordings.map(async (r) => {
        if (!r.minio_key) return [r.id, null] as const;
        try {
          return [r.id, await presignDownload(r.minio_key)] as const;
        } catch {
          return [r.id, null] as const;
        }
      }),
    ).then((pairs) => {
      if (!alive) return;
      const m: Record<number, string> = {};
      for (const [id, u] of pairs) if (u) m[id] = u;
      setUrls(m);
    });
    return () => {
      alive = false;
    };
  }, [recordings]);

  const go = useCallback(
    (delta: number) =>
      setI((c) => Math.max(0, Math.min(count - 1, c + delta))),
    [count],
  );

  // Arrow-key navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Track fullscreen state so we can restyle and swap the button label.
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* fullscreen may be blocked; ignore */
    }
  }

  const atStart = i === 0;
  const atEnd = i === count - 1;

  return (
    <div
      ref={containerRef}
      className={
        fs
          ? "flex h-full flex-col gap-4 overflow-y-auto bg-black p-6 text-white"
          : "card space-y-4"
      }
    >
      {/* Header: counter + prompt + score + fullscreen toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-xs font-medium uppercase tracking-wide ${
              fs ? "text-white/60" : "text-gray-400 dark:text-slate-500"
            }`}
          >
            Question {i + 1} / {count}
          </p>
          <h3 className="truncate font-semibold" title={q?.prompt}>
            {q?.prompt ?? "Question supprimée"}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rec?.ai_score != null && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(
                rec.ai_score,
              )}`}
            >
              {rec.ai_score}/100
            </span>
          )}
          <button
            onClick={toggleFullscreen}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              fs
                ? "bg-white/15 text-white hover:bg-white/25"
                : "btn-secondary"
            }`}
            title={fs ? "Quitter le plein écran" : "Plein écran"}
          >
            {fs ? "✕ Quitter" : "⛶ Plein écran"}
          </button>
        </div>
      </div>

      {/* Video area with overlaid prev/next arrows */}
      <div className="relative flex flex-1 items-center justify-center">
        <NavArrow side="left" onClick={() => go(-1)} disabled={atStart} />
        <div
          key={rec?.id}
          className="animate-viewer-in flex w-full items-center justify-center"
        >
          {rec?.minio_key ? (
            url ? (
              rec.media_type === "audio" ? (
                <audio controls src={url} className="w-full max-w-xl" />
              ) : (
                <video
                  key={url}
                  controls
                  autoPlay
                  src={url}
                  className={`w-auto max-w-full rounded-xl bg-black ${
                    fs ? "max-h-[78vh]" : "max-h-[55vh]"
                  }`}
                />
              )
            ) : (
              <p
                className={
                  fs ? "text-white/60" : "text-gray-400 dark:text-slate-500"
                }
              >
                Chargement de l&apos;enregistrement…
              </p>
            )
          ) : (
            <p
              className={
                fs ? "text-white/60" : "text-gray-400 dark:text-slate-500"
              }
            >
              Aucun enregistrement pour cette réponse.
            </p>
          )}
        </div>
        <NavArrow side="right" onClick={() => go(1)} disabled={atEnd} />
      </div>

      {/* Dots to jump directly to a question */}
      <div className="flex flex-wrap justify-center gap-2">
        {recordings.map((r, idx) => (
          <button
            key={r.id}
            onClick={() => setI(idx)}
            aria-label={`Aller à la question ${idx + 1}`}
            className={`h-2.5 rounded-full transition-all ${
              idx === i
                ? "w-6 bg-brand"
                : fs
                  ? "w-2.5 bg-white/30 hover:bg-white/50"
                  : "w-2.5 bg-black/15 hover:bg-black/30 dark:bg-white/20 dark:hover:bg-white/40"
            }`}
          />
        ))}
      </div>

      {/* Prominent prev / next controls (visible in fullscreen too) */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => go(-1)}
          disabled={atStart}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            fs ? "bg-white/15 text-white hover:bg-white/25" : "btn-secondary"
          }`}
        >
          ‹ Précédent
        </button>
        <button
          onClick={() => go(1)}
          disabled={atEnd}
          className="btn-primary disabled:opacity-40"
        >
          Question suivante ›
        </button>
      </div>

      {/* Transcript + AI feedback (hidden in fullscreen to focus on the video) */}
      {!fs && rec && (
        <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {rec.transcript && (
            <div>
              <p className="text-xs font-medium uppercase text-gray-400 dark:text-slate-500">
                Votre réponse (transcription)
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-slate-300">
                {rec.transcript}
              </p>
            </div>
          )}
          {rec.ai_feedback && (
            <div>
              <p className="text-xs font-medium uppercase text-gray-400 dark:text-slate-500">
                Retour de l&apos;IA
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-200">
                {rec.ai_feedback}
              </p>
            </div>
          )}
          {rec.ai_score == null && (
            <p className="text-sm text-gray-400 dark:text-slate-500">
              Non encore évalué.
            </p>
          )}

          {q?.answer_text && (
            <details className="group rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <summary className="cursor-pointer select-none text-xs font-medium uppercase text-gray-500 hover:text-brand dark:text-slate-400">
                Réponse modèle
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-200">
                {q.answer_text}
              </p>
              {q.attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {q.attachments.map((a) => (
                    <ModelAttachment key={a.id} attachment={a} />
                  ))}
                </div>
              )}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ModelAttachment({
  attachment,
}: {
  attachment: {
    id: number;
    filename: string;
    minio_key: string;
    content_type?: string;
  };
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    presignDownload(attachment.minio_key).then(setUrl).catch(() => {});
  }, [attachment.minio_key]);

  const isImage =
    (attachment.content_type || "").startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(attachment.filename);

  if (!url) {
    return (
      <span className="text-sm text-gray-400 dark:text-slate-500">
        Chargement de {attachment.filename}…
      </span>
    );
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.filename}
          className="max-h-80 w-auto rounded-lg border border-black/10 dark:border-white/15"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block text-sm text-brand hover:underline"
    >
      📎 {attachment.filename}
    </a>
  );
}

function NavArrow({
  side,
  onClick,
  disabled,
}: {
  side: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Question précédente" : "Question suivante"}
      className={`absolute ${
        side === "left" ? "left-1" : "right-1"
      } z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl text-white backdrop-blur transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}
