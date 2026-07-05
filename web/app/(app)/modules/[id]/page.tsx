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

  if (loading) return <p className="text-gray-400">Chargement…</p>;
  if (!module)
    return (
      <div className="card text-gray-500">
        Module introuvable.{" "}
        <Link href="/modules" className="text-brand">
          Retour
        </Link>
      </div>
    );

  const questions = module.questions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/modules" className="text-sm text-brand">
            ← Mes modules
          </Link>
          <h1 className="text-2xl font-bold">
            {module.name}{" "}
            <span className="text-base font-normal text-gray-400">
              ({questions.length} question{questions.length > 1 ? "s" : ""})
            </span>
          </h1>
          {module.description && (
            <p className="text-sm text-gray-500">{module.description}</p>
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
        <div className="card text-gray-500">
          Aucune question dans ce module.
        </div>
      ) : (
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <QuestionCard key={q.id} index={i} question={q} masked={maskAll} />
          ))}
        </ol>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  masked,
}: {
  index: number;
  question: Question;
  masked: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const show = !masked || revealed;

  return (
    <li className="card space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
          {index + 1}
        </span>
        <h2 className="text-lg font-semibold">{question.prompt}</h2>
      </div>

      {show ? (
        <div className="ml-10 space-y-3">
          <pre className="whitespace-pre-wrap font-sans text-gray-700">
            {question.answer_text || "(aucune réponse fournie)"}
          </pre>
          {question.attachments.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">
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
  attachment: { id: number; filename: string; minio_key: string };
}) {
  async function open() {
    const url = await presignDownload(attachment.minio_key);
    window.open(url, "_blank");
  }
  return (
    <button onClick={open} className="block text-sm text-brand hover:underline">
      📎 {attachment.filename}
    </button>
  );
}
