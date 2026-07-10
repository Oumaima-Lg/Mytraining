"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Module } from "@/lib/api";

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const query = search.trim().toLowerCase();
  const filtered = query
    ? modules.filter((m) => m.name.toLowerCase().includes(query))
    : modules;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mes modules</h1>
        <Link href="/modules/new" className="btn-primary">
          Nouveau module
        </Link>
      </div>

      {!loading && modules.length > 0 && (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500">
            🔍
          </span>
          <input
            type="search"
            className="input pl-9"
            placeholder="Rechercher un module par nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 dark:text-slate-500">Chargement…</p>
      ) : modules.length === 0 ? (
        <div className="card text-center text-gray-500 dark:text-slate-400">
          Aucun module. Créez-en un pour commencer.
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-500 dark:text-slate-400">
          Aucun module ne correspond à «&nbsp;{search}&nbsp;».
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between">
                <Link href={`/modules/${m.id}`} className="group">
                  <h2 className="text-lg font-semibold group-hover:text-brand">
                    {m.name}
                  </h2>
                  <p className="text-sm text-gray-400 dark:text-slate-500">
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
                <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{m.description}</p>
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
