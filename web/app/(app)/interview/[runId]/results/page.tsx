"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, presignDownload, Recording, Question } from "@/lib/api";

type RunData = {
  id: number;
  interview: { questions: Question[] };
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
      const { run } = await api.post<{ run: RunData }>(
        `ai/runs/${runId}/evaluate`,
      );
      setRun(run);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEvaluating(false);
    }
  }

  if (!run) return <p className="text-gray-400 dark:text-slate-500">Chargement…</p>;

  const questionById = new Map(
    run.interview.questions.map((q) => [q.id, q]),
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
        <div className="space-y-4">
          {run.recordings.map((rec) => {
            const q = rec.question_id
              ? questionById.get(rec.question_id)
              : undefined;
            return (
              <div key={rec.id} className="card space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">
                    {q?.prompt ?? "Question supprimée"}
                  </h3>
                  {rec.ai_score !== null && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(
                        rec.ai_score,
                      )}`}
                    >
                      {rec.ai_score}/100
                    </span>
                  )}
                </div>

                {rec.minio_key ? (
                  <MediaPlayer
                    minioKey={rec.minio_key}
                    mediaType={rec.media_type}
                  />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-slate-500">
                    Aucun enregistrement pour cette réponse.
                  </p>
                )}

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

                {rec.ai_score === null && (
                  <p className="text-sm text-gray-400 dark:text-slate-500">
                    Non encore évalué.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MediaPlayer({
  minioKey,
  mediaType,
}: {
  minioKey: string;
  mediaType: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    presignDownload(minioKey)
      .then(setUrl)
      .catch(() => setError(true));
  }, [minioKey]);

  if (error)
    return (
      <p className="text-sm text-red-600">
        Impossible de charger l&apos;enregistrement.
      </p>
    );
  if (!url)
    return (
      <p className="text-sm text-gray-400 dark:text-slate-500">
        Chargement de l&apos;enregistrement…
      </p>
    );

  return mediaType === "audio" ? (
    <audio controls src={url} className="w-full" />
  ) : (
    <video
      controls
      src={url}
      className="w-full max-w-md rounded-lg bg-black"
    />
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}
