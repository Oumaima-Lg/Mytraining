import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Préparez vos entretiens</h1>
        <p className="mt-2 text-gray-500 dark:text-slate-400">
          Créez des modules de questions/réponses, puis passez des entretiens
          chronométrés avec caméra et retour IA.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Link href="/modules/new" className="card block hover:shadow-md">
          <div className="text-4xl">➕</div>
          <h2 className="mt-3 text-xl font-semibold">
            Ajouter un nouveau module (Q&amp;A)
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Nommez-le (java-qa, rh-qa…), ajoutez des questions, réponses et
            pièces jointes.
          </p>
        </Link>

        <Link href="/interview/new" className="card block hover:shadow-md">
          <div className="text-4xl">🎤</div>
          <h2 className="mt-3 text-xl font-semibold">Passer un entretien</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Choisissez 2 à 3 modules, réglez le temps et l&apos;enregistrement,
            puis lancez.
          </p>
        </Link>
      </div>
    </div>
  );
}
