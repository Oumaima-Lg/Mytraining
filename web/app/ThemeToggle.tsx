"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark toggle. The initial class is set before paint by the inline
 * script in the root layout (no flash); this component just reflects and
 * flips it, persisting the choice to localStorage.
 */
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      title={dark ? "Mode clair" : "Mode sombre"}
      className={`rounded-lg border border-black/10 px-2 py-1 text-base leading-none transition hover:bg-brand/5 dark:border-white/15 ${className}`}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
