"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Module, Interview } from "@/lib/api";

export default function NewInterviewPage() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("Mon entretien");
  const [totalMin, setTotalMin] = useState(15);
  const [perQuestionSec, setPerQuestionSec] = useState(120);
  const [perModuleMin, setPerModuleMin] = useState(5);
  const [recordAudio, setRecordAudio] = useState(true);
  const [recordVideo, setRecordVideo] = useState(true);
  const [showCamera, setShowCamera] = useState(true);
  const [hideAnswers, setHideAnswers] = useState(true);

  useEffect(() => {
    api
      .get<{ modules: Module[] }>("modules")
      .then((d) => setModules(d.modules));
  }, []);

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur; // max 3
      return [...cur, id];
    });
  }

  const filtered = modules.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function start() {
    setError("");
    if (selected.length < 2 || selected.length > 3) {
      setError("Choisissez entre 2 et 3 modules.");
      return;
    }
    setBusy(true);
    try {
      const { interview } = await api.post<{ interview: Interview }>(
        "interviews",
        {
          name,
          module_ids: selected,
          total_time_sec: totalMin * 60,
          per_question_time_sec: perQuestionSec,
          per_module_time_sec: perModuleMin * 60,
          record_audio: recordAudio,
          record_video: recordVideo,
          show_camera: showCamera,
          hide_answers: hideAnswers,
        },
      );
      const { run } = await api.post<{ run: { id: number } }>(
        `interviews/${interview.id}/runs`,
      );
      router.push(`/interview/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configurer un entretien</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card space-y-3">
        <label className="label">Nom de l&apos;entretien</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Modules (2 à 3)</h2>
          <span className="text-sm text-gray-400 dark:text-slate-500">
            {selected.length} sélectionné(s)
          </span>
        </div>
        <input
          className="input"
          placeholder="Rechercher un module…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  on
                    ? "border-brand bg-brand/5"
                    : "border-black/10 hover:border-brand/40 dark:border-white/15"
                }`}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {m.question_count} question(s)
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500">Aucun module trouvé.</p>
          )}
        </div>
      </div>

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Temps total (min)</label>
          <input
            type="number"
            className="input"
            value={totalMin}
            onChange={(e) => setTotalMin(+e.target.value)}
          />
        </div>
        <div>
          <label className="label">Temps / question (sec)</label>
          <input
            type="number"
            className="input"
            value={perQuestionSec}
            onChange={(e) => setPerQuestionSec(+e.target.value)}
          />
        </div>
        <div>
          <label className="label">Temps / module (min)</label>
          <input
            type="number"
            className="input"
            value={perModuleMin}
            onChange={(e) => setPerModuleMin(+e.target.value)}
          />
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Réglages d&apos;enregistrement</h2>
        <Toggle label="Enregistrer l'audio" on={recordAudio} set={setRecordAudio} />
        <Toggle label="Enregistrer la vidéo" on={recordVideo} set={setRecordVideo} />
        <Toggle
          label="Afficher la capture caméra"
          on={showCamera}
          set={setShowCamera}
        />
        <Toggle
          label="Cacher les réponses (questions seules)"
          on={hideAnswers}
          set={setHideAnswers}
        />
      </div>

      <button onClick={start} className="btn-primary" disabled={busy}>
        {busy ? "Démarrage…" : "Démarrer l'entretien"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  on,
  set,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="h-5 w-5 accent-brand"
      />
    </label>
  );
}
