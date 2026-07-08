"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, presignDownload, Module, Question } from "@/lib/api";

export default function ModuleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [maskAll, setMaskAll] = useState(false);

  useEffect(() => {
    api
      .get<{ module: Module }>(`modules/${params.id}`)
      .then((d) => setModule(d.module))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p className="text-gray-400 dark:text-slate-500">Chargement…</p>;
  if (!module)
    return (
      <div className="card text-gray-500 dark:text-slate-400">
        Module introuvable.{" "}
        <Link href="/modules" className="text-brand">
          Retour
        </Link>
      </div>
    );

  const questions = module.questions ?? [];

  function handleQuestionUpdated(updated: Question) {
    setModule((m) =>
      m
        ? {
            ...m,
            questions: (m.questions ?? []).map((q) =>
              q.id === updated.id ? { ...q, ...updated } : q,
            ),
          }
        : m,
    );
  }

  function handleQuestionDeleted(id: number) {
    setModule((m) =>
      m
        ? {
            ...m,
            questions: (m.questions ?? []).filter((q) => q.id !== id),
            question_count: Math.max(0, m.question_count - 1),
          }
        : m,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/modules" className="text-sm text-brand">
            ← Mes modules
          </Link>
          <ModuleTitle
            module={module}
            count={questions.length}
            onRenamed={(name) =>
              setModule((m) => (m ? { ...m, name } : m))
            }
          />
          {module.description && (
            <p className="text-sm text-gray-500 dark:text-slate-400">{module.description}</p>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={maskAll}
            onChange={(e) => setMaskAll(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Mode révision (cacher les réponses)
        </label>
      </div>

      {questions.length === 0 ? (
        <div className="card text-gray-500 dark:text-slate-400">
          Aucune question dans ce module.
        </div>
      ) : (
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i}
              moduleId={module.id}
              question={q}
              masked={maskAll}
              onUpdated={handleQuestionUpdated}
              onDeleted={handleQuestionDeleted}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ModuleTitle({
  module,
  count,
  onRenamed,
}: {
  module: Module;
  count: number;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(module.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom du module est requis");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.patch(`modules/${module.id}`, { name: trimmed });
      onRenamed(trimmed);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button onClick={save} className="btn-primary text-sm" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            onClick={() => {
              setName(module.name);
              setError("");
              setEditing(false);
            }}
            className="btn-secondary text-sm"
            disabled={busy}
          >
            Annuler
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
      {module.name}{" "}
      <span className="text-base font-normal text-gray-400 dark:text-slate-500">
        ({count} question{count > 1 ? "s" : ""})
      </span>
      <button
        onClick={() => setEditing(true)}
        className="text-sm font-normal text-brand hover:underline"
      >
        ✏️ Renommer
      </button>
    </h1>
  );
}

function QuestionCard({
  index,
  moduleId,
  question,
  masked,
  onUpdated,
  onDeleted,
}: {
  index: number;
  moduleId: number;
  question: Question;
  masked: boolean;
  onUpdated: (q: Question) => void;
  onDeleted: (id: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);
  const [answer, setAnswer] = useState(question.answer_text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const show = !masked || revealed;

  async function save() {
    if (!prompt.trim()) {
      setError("L'intitulé de la question est requis");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { question: updated } = await api.patch<{ question: Question }>(
        `modules/${moduleId}/questions/${question.id}`,
        { prompt: prompt.trim(), answer_text: answer },
      );
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Supprimer cette question et sa réponse ?\n\n« ${question.prompt} »`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.del(`modules/${moduleId}/questions/${question.id}`);
      onDeleted(question.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="card space-y-3">
        <div>
          <label className="label">Question</label>
          <textarea
            className="input"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Réponse</label>
          <textarea
            className="input"
            rows={6}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary text-sm" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            onClick={() => {
              setPrompt(question.prompt);
              setAnswer(question.answer_text);
              setError("");
              setEditing(false);
            }}
            className="btn-secondary text-sm"
            disabled={busy}
          >
            Annuler
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="card space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
          {index + 1}
        </span>
        <h2 className="flex-1 text-lg font-semibold">{question.prompt}</h2>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-brand hover:underline"
          >
            ✏️ Modifier
          </button>
          <button
            onClick={remove}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
            disabled={busy}
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>

      {error && <p className="ml-10 text-sm text-red-600">{error}</p>}

      {show ? (
        <div className="ml-10 space-y-3">
          <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-slate-200">
            {question.answer_text || "(aucune réponse fournie)"}
          </pre>
          {question.attachments.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                Documents joints :
              </p>
              {question.attachments.map((a) => (
                <AttachmentLink key={a.id} attachment={a} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ml-10">
          <button
            onClick={() => setRevealed(true)}
            className="btn-secondary text-sm"
          >
            Afficher la réponse
          </button>
        </div>
      )}
    </li>
  );
}

function AttachmentLink({
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

  if (isImage) {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={`Ouvrir ${attachment.filename}`}
        className="block"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.filename}
            className="max-h-96 w-auto rounded-lg border border-black/10 dark:border-white/15"
          />
        ) : (
          <span className="text-sm text-gray-400 dark:text-slate-500">
            Chargement de {attachment.filename}…
          </span>
        )}
      </a>
    );
  }

  return (
    <button
      onClick={() => url && window.open(url, "_blank")}
      className="block text-sm text-brand hover:underline"
    >
      📎 {attachment.filename}
    </button>
  );
}
