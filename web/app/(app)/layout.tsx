import Link from "next/link";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "../ThemeToggle";
import ScrollToTop from "./ScrollToTop";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
          <Link href="/" className="text-base font-bold text-brand">
            PrepEntretien
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/modules"
              className="text-gray-600 hover:text-brand dark:text-gray-300"
            >
              Mes modules
            </Link>
            <Link
              href="/interview/new"
              className="text-gray-600 hover:text-brand dark:text-gray-300"
            >
              Passer un entretien
            </Link>
            <Link
              href="/history"
              className="text-gray-600 hover:text-brand dark:text-gray-300"
            >
              Historique
            </Link>
            <LogoutButton />
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <ScrollToTop />
    </div>
  );
}
