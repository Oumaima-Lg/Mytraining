"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, uploadFile, Module, Question } from "@/lib/api";

export default function NewModulePage() {
  const router = useRouter();
  const [module, setModule] = useState<Module | null>(null);

  // Step 1 fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function createModule(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { module } = await api.post<{ module: Module }>("modules", {
        name,
        description,
      });
      setModule(module);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!module) {
    return (
      <form onSubmit={createModule} className="card mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">Nouveau module Q&amp;A</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="label">Nom du module</label>
          <input
            className="input"
            placeholder="java-qa, rh-qa…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Description (optionnel)</label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full">Continuer</button>
      </form>
    );
  }

  return (
    <QuestionBuilder
      module={module}
      onFinish={() => router.push("/modules")}
    />
  );
}

function QuestionBuilder({
  module,
  onFinish,
}: {
  module: Module;
  onFinish: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // AI generation
  const [topic, setTopic] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  async function addQuestion(files: FileList | null) {
    if (!prompt.trim()) {
      setError("L'intitulé de la question est requis");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { question } = await api.post<{ question: Question }>(
        `modules/${module.id}/questions`,
        { prompt, answer_text: answer },
      );
      // Upload attachments (if any) and register them.
      if (files) {
        for (const file of Array.from(files)) {
          const { key } = await uploadFile(file, "attachment");
          await api.post(
            `modules/${module.id}/questions/${question.id}/attachments`,
            {
              filename: file.name,
              minio_key: key,
              content_type: file.type,
              size: file.size,
            },
          );
        }
      }
      // Re-fetch to get attachments attached.
      const { module: fresh } = await api.get<{ module: Module }>(
        `modules/${module.id}`,
      );
      setQuestions(fresh.questions ?? []);
      setPrompt("");
      setAnswer("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!topic.trim()) return;
    setGenBusy(true);
    setError("");
    try {
      const { questions: gen } = await api.post<{
        questions: { prompt: string; answer_text: string }[];
      }>("ai/generate-questions", { topic, count: 5 });
      for (const q of gen) {
        await api.post(`modules/${module.id}/questions`, q);
      }
      const { module: fresh } = await api.get<{ module: Module }>(
        `modules/${module.id}`,
      );
      setQuestions(fresh.questions ?? []);
      setTopic("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Module : <span className="text-brand">{module.name}</span>
        </h1>
        <button onClick={onFinish} className="btn-secondary">
          Terminer
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <QuestionForm
          prompt={prompt}
          answer={answer}
          busy={busy}
          onPrompt={setPrompt}
          onAnswer={setAnswer}
          onSubmit={addQuestion}
        />

        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-semibold">✨ Générer avec l&apos;IA</h3>
            <textarea
              className="input"
              rows={3}
              placeholder="Sujet ou description du poste (ex. développeur Java junior)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button
              onClick={generate}
              className="btn-secondary w-full"
              disabled={genBusy}
            >
              {genBusy ? "Génération…" : "Générer 5 questions"}
            </button>
          </div>

          <div className="card">
            <h3 className="mb-2 font-semibold">
              Questions ajoutées ({questions.length})
            </h3>
            {questions.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500">Aucune question pour l&apos;instant.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {questions.map((q, i) => (
                  <li key={q.id} className="border-b border-black/5 dark:border-white/10 pb-2">
                    <span className="font-medium">
                      {i + 1}. {q.prompt}
                    </span>
                    {q.attachments.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">
                        📎 {q.attachments.length}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionForm({
  prompt,
  answer,
  busy,
  onPrompt,
  onAnswer,
  onSubmit,
}: {
  prompt: string;
  answer: string;
  busy: boolean;
  onPrompt: (v: string) => void;
  onAnswer: (v: string) => void;
  onSubmit: (files: FileList | null) => void;
}) {
  const [files, setFiles] = useState<FileList | null>(null);

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Nouvelle question</h3>
      <div>
        <label className="label">Question</label>
        <textarea
          className="input"
          rows={2}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Réponse</label>
        <textarea
          className="input"
          rows={4}
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
        />
      </div>
      <div>
        <label className="label">
          Pièces jointes (images, PDF, schémas…)
        </label>
        <input
          type="file"
          multiple
          className="text-sm"
          onChange={(e) => setFiles(e.target.files)}
        />
      </div>
      <button
        onClick={() => {
          onSubmit(files);
          setFiles(null);
        }}
        className="btn-primary w-full"
        disabled={busy}
      >
        {busy ? "Enregistrement…" : "Suivant (ajouter la question)"}
      </button>
    </div>
  );
}
