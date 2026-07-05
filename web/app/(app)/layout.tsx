import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold text-brand">
            PrepEntretien
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/modules" className="text-gray-600 hover:text-brand">
              Mes modules
            </Link>
            <Link href="/interview/new" className="text-gray-600 hover:text-brand">
              Passer un entretien
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
