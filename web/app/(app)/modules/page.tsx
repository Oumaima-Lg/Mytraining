"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Module } from "@/lib/api";

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { modules } = await api.get<{ modules: Module[] }>("modules");
    setModules(modules);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: number) {
    if (!confirm("Supprimer ce module ?")) return;
    await api.del(`modules/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mes modules</h1>
        <Link href="/modules/new" className="btn-primary">
          Nouveau module
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement…</p>
      ) : modules.length === 0 ? (
        <div className="card text-center text-gray-500">
          Aucun module. Créez-en un pour commencer.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between">
                <Link href={`/modules/${m.id}`} className="group">
                  <h2 className="text-lg font-semibold group-hover:text-brand">
                    {m.name}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {m.question_count} question(s)
                  </p>
                </Link>
                <button
                  onClick={() => remove(m.id)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Supprimer
                </button>
              </div>
              {m.description && (
                <p className="mt-2 text-sm text-gray-500">{m.description}</p>
              )}
              <Link
                href={`/modules/${m.id}`}
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Réviser les questions/réponses →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
