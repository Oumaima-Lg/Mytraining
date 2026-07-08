import ThemeToggle from "../ThemeToggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="fixed right-3 top-3 z-50">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
