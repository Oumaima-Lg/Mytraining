"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, RunSummary } from "@/lib/api";

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ runs: RunSummary[] }>("interviews/runs")
      .then((d) => setRuns(d.runs))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historique des entretiens</h1>
        <Link href="/interview/new" className="btn-primary">
          Passer un entretien
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-slate-500">Chargement…</p>
      ) : runs.length === 0 ? (
        <div className="card text-center text-gray-500 dark:text-slate-400">
          Aucun entretien passé pour l&apos;instant. Lancez-en un pour le
          retrouver ici.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/interview/${run.id}/results`}
              className="card flex items-center justify-between gap-4 hover:shadow-md"
            >
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {run.interview_name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {formatDate(run.started_at)} · {run.recording_count} réponse
                  {run.recording_count > 1 ? "s" : ""}
                  {run.scored_count > 0 && ` · ${run.scored_count} évaluée(s)`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {run.avg_score !== null && (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(
                      run.avg_score,
                    )}`}
                  >
                    {run.avg_score}/100
                  </span>
                )}
                <StatusBadge status={run.status} />
                <span className="text-brand">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const finished = status === "finished";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        finished
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
      }`}
    >
      {finished ? "Terminé" : "En cours"}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
