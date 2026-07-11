"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, RunSummary } from "@/lib/api";

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<{ runs: RunSummary[] }>("interviews/runs")
      .then((d) => setRuns(d.runs))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === runs.length ? new Set() : new Set(runs.map((r) => r.id)),
    );
  }

  async function deleteIds(ids: number[]) {
    if (ids.length === 0) return;
    const msg =
      ids.length === 1
        ? "Supprimer cet entretien de l'historique ? La vidéo et les données associées seront définitivement supprimées."
        : `Supprimer ${ids.length} entretiens de l'historique ? Les vidéos et données associées seront définitivement supprimées.`;
    if (!window.confirm(msg)) return;

    setDeleting(true);
    setError("");
    try {
      await Promise.all(ids.map((id) => api.del(`interviews/runs/${id}`)));
      setRuns((cur) => cur.filter((r) => !ids.includes(r.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historique des entretiens</h1>
        <Link href="/interview/new" className="btn-primary">
          Passer un entretien
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Selection toolbar */}
      {!loading && runs.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={selected.size === runs.length && runs.length > 0}
              onChange={toggleAll}
            />
            {selected.size > 0
              ? `${selected.size} sélectionné(s)`
              : "Tout sélectionner"}
          </label>
          {selected.size > 0 && (
            <button
              onClick={() => deleteIds([...selected])}
              disabled={deleting}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              {deleting
                ? "Suppression…"
                : `Supprimer la sélection (${selected.size})`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 dark:text-slate-500">Chargement…</p>
      ) : runs.length === 0 ? (
        <div className="card text-center text-gray-500 dark:text-slate-400">
          Aucun entretien passé pour l&apos;instant. Lancez-en un pour le
          retrouver ici.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const checked = selected.has(run.id);
            return (
              <div
                key={run.id}
                className={`card flex items-center gap-4 transition ${
                  checked ? "ring-2 ring-brand" : "hover:shadow-md"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-brand"
                  checked={checked}
                  onChange={() => toggle(run.id)}
                  aria-label={`Sélectionner ${run.interview_name}`}
                />
                <Link
                  href={`/interview/${run.id}/results`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                      {run.interview_name}
                    </h2>
                    {run.modules.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {run.modules.map((name) => (
                          <span
                            key={name}
                            className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                      {formatDate(run.started_at)} · {run.recording_count}{" "}
                      réponse{run.recording_count > 1 ? "s" : ""}
                      {run.scored_count > 0 &&
                        ` · ${run.scored_count} évaluée(s)`}
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
                  </div>
                </Link>
                <button
                  onClick={() => deleteIds([run.id])}
                  disabled={deleting}
                  title="Supprimer cet entretien"
                  aria-label="Supprimer cet entretien"
                  className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-red-400"
                >
                  🗑
                </button>
              </div>
            );
          })}
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
